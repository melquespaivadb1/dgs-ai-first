import { z } from 'zod';
import { logger } from '../shared/logger.js';

// ---------------------------------------------------------------------------
// Schema — estrutura que o modelo DEVE responder em JSON.
// Todos os campos são requeridos; source_document nunca é nullable.
// Falha estrutural aqui = guardrail 4.1 aplicado automaticamente.
// ---------------------------------------------------------------------------

export const SourceDocumentSchema = z.object({
  id: z.string().min(1, 'ID do documento é obrigatório'),
  section: z.string().optional(),
});

export const AssistantResponseSchema = z
  .object({
    answer: z.string().min(1, 'Resposta não pode ser vazia'),
    source_document: SourceDocumentSchema,
    confidence_score: z.number().min(0).max(1),
  })
  .superRefine((data, ctx) => {
    // Guardrail 4.2 — POL-001 §3.2: carga perigosa NÃO é elegível para devolução
    // pelo processo padrão. Qualquer resposta que mencione os dois temas sem a
    // negativa obrigatória é bloqueada aqui, antes de chegar ao atendente.
    const lower = data.answer.toLowerCase();
    const mentionsDangerousCargo = lower.includes('carga perigosa');
    const mentionsReturn = /devolu|devolver|devolvid/.test(lower);

    if (!mentionsDangerousCargo || !mentionsReturn) return;

    const REQUIRED_NEGATION_TERMS = [
      'não são elegíveis',
      'não é elegível',
      'não pode pelo processo padrão',
      'não se aplica ao processo padrão',
      'não pode ser devolvid',
      'tratamento especial',
      'gestão de riscos',
      'ramal 4500',
    ];

    const hasNegation = REQUIRED_NEGATION_TERMS.some((term) => lower.includes(term));

    if (!hasNegation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['answer'],
        message:
          'GUARDRAIL_4.2: resposta afirma ou não nega devolução de carga perigosa — bloqueada (POL-001 §3.2)',
      });
    }
  });

export type SourceDocument = z.infer<typeof SourceDocumentSchema>;
export type AssistantResponse = z.infer<typeof AssistantResponseSchema>;

export const FALLBACK_RESPONSE = {
  answer:
    'Não foi possível processar sua consulta com uma fonte verificada. ' +
    'Por favor, consulte a documentação oficial ou entre em contato com o time responsável.',
  source_document: { id: 'N/A' },
  confidence_score: 0,
} satisfies AssistantResponse;

// ---------------------------------------------------------------------------
// Validator — única entrada pública para quem quer validar uma completion.
// ---------------------------------------------------------------------------

export type ValidatedResponse = {
  response: AssistantResponse;
  validated: boolean;
};

/**
 * Recebe a completion bruta do modelo (string JSON), valida contra o schema
 * (guardrails 4.1 e 4.2 incluídos) e retorna sempre uma resposta segura.
 * Falhas são registradas em log antes de retornar o fallback.
 */
export function validateResponse(rawCompletion: string): ValidatedResponse {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawCompletion);
  } catch (err) {
    logger.warn(
      { err, rawPreview: rawCompletion.slice(0, 200) },
      'response_validator: JSON parse falhou — retornando fallback',
    );
    return { response: FALLBACK_RESPONSE, validated: false };
  }

  const result = AssistantResponseSchema.safeParse(parsed);

  if (!result.success) {
    const issues = result.error.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }));
    logger.warn({ issues }, 'response_validator: schema inválido — retornando fallback');
    return { response: FALLBACK_RESPONSE, validated: false };
  }

  return { response: result.data, validated: true };
}
