import { describe, expect, it } from 'vitest';
import { validateResponse, FALLBACK_RESPONSE } from '../../../src/services/response-validator.js';

// Monta o payload JSON que o modelo deveria retornar.
// Spread de overrides por último para cobrir campos individuais nos testes.
function makeCompletion(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    answer: 'O prazo de devolução é de 7 dias úteis conforme POL-001.',
    source_document: { id: 'POL-001', section: '§3.1' },
    confidence_score: 0.9,
    ...overrides,
  });
}

describe('validateResponse', () => {
  // -------------------------------------------------------------------------
  describe('resposta válida', () => {
    it('retorna validated: true e o conteúdo correto para JSON bem formado', () => {
      const result = validateResponse(makeCompletion());

      expect(result.validated).toBe(true);
      expect(result.response.answer).toBe('O prazo de devolução é de 7 dias úteis conforme POL-001.');
      expect(result.response.source_document.id).toBe('POL-001');
      expect(result.response.source_document.section).toBe('§3.1');
      expect(result.response.confidence_score).toBe(0.9);
    });

    it('aceita source_document sem section (campo opcional)', () => {
      const result = validateResponse(makeCompletion({ source_document: { id: 'SLA-2024' } }));

      expect(result.validated).toBe(true);
      expect(result.response.source_document.section).toBeUndefined();
    });

    it('aceita confidence_score no limite inferior (0)', () => {
      const result = validateResponse(makeCompletion({ confidence_score: 0 }));

      expect(result.validated).toBe(true);
      expect(result.response.confidence_score).toBe(0);
    });

    it('aceita confidence_score no limite superior (1)', () => {
      const result = validateResponse(makeCompletion({ confidence_score: 1 }));

      expect(result.validated).toBe(true);
    });

    it('aceita campos extras e os remove do output (modo strip do Zod)', () => {
      // O modelo pode devolver campos de debug, chain-of-thought ou metadados
      // em versões futuras. O schema usa o modo strip padrão do Zod: campos
      // desconhecidos não causam falha — são silenciosamente descartados.
      // Isso garante que mudanças no modelo não derrubem o validator.
      const json = makeCompletion({
        reasoning: 'O documento POL-001 §3.1 define o prazo geral de 7 dias úteis.',
        token_count: 142,
        model_version: 'gpt-4o-2024-08',
        debug: { retrieved_chunks: 3, reranked: true },
      });

      const result = validateResponse(json);

      expect(result.validated).toBe(true);
      // Campos extras não chegam ao output — o cliente nunca os vê.
      expect(result.response).not.toHaveProperty('reasoning');
      expect(result.response).not.toHaveProperty('token_count');
      expect(result.response).not.toHaveProperty('model_version');
      expect(result.response).not.toHaveProperty('debug');
      // Apenas os campos do schema estão presentes.
      expect(Object.keys(result.response)).toEqual(
        expect.arrayContaining(['answer', 'source_document', 'confidence_score']),
      );
      expect(Object.keys(result.response)).toHaveLength(3);
    });
  });

  // -------------------------------------------------------------------------
  describe('guardrail 4.1 — source_document obrigatório', () => {
    it('retorna fallback quando source_document está ausente', () => {
      const json = JSON.stringify({ answer: 'Resposta sem fonte.', confidence_score: 0.8 });
      const result = validateResponse(json);

      expect(result.validated).toBe(false);
      expect(result.response).toEqual(FALLBACK_RESPONSE);
    });

    it('retorna fallback quando source_document.id é string vazia', () => {
      const result = validateResponse(makeCompletion({ source_document: { id: '' } }));

      expect(result.validated).toBe(false);
      expect(result.response).toEqual(FALLBACK_RESPONSE);
    });

    it('retorna fallback quando source_document é null', () => {
      const result = validateResponse(makeCompletion({ source_document: null }));

      expect(result.validated).toBe(false);
      expect(result.response).toEqual(FALLBACK_RESPONSE);
    });
  });

  // -------------------------------------------------------------------------
  describe('guardrail 4.2 — carga perigosa + devolução sem negativa (POL-001 §3.2)', () => {
    it('bloqueia resposta que afirma que devolução de carga perigosa é possível', () => {
      const json = makeCompletion({
        answer: 'Sim, a devolução de carga perigosa é possível mediante solicitação.',
        source_document: { id: 'POL-001' },
      });

      const result = validateResponse(json);

      expect(result.validated).toBe(false);
      expect(result.response).toEqual(FALLBACK_RESPONSE);
    });

    it('bloqueia variante lexical com "devolver" sem negativa', () => {
      const json = makeCompletion({
        answer: 'O cliente pode devolver carga perigosa ao centro de distribuição.',
        source_document: { id: 'POL-001' },
      });

      expect(validateResponse(json).validated).toBe(false);
    });

    it('bloqueia variante lexical com "devolvida" sem negativa', () => {
      const json = makeCompletion({
        answer: 'A carga perigosa pode ser devolvida em até 7 dias úteis.',
        source_document: { id: 'POL-001' },
      });

      expect(validateResponse(json).validated).toBe(false);
    });

    it('passa quando resposta traz "não são elegíveis" como negativa', () => {
      const json = makeCompletion({
        answer:
          'Cargas perigosas não são elegíveis para devolução pelo processo padrão. ' +
          'O cliente deve contatar Gestão de Riscos pelo ramal 4500.',
        source_document: { id: 'POL-001', section: '§3.2' },
      });

      expect(validateResponse(json).validated).toBe(true);
    });

    it('passa quando resposta traz "gestão de riscos" como negativa implícita', () => {
      const json = makeCompletion({
        answer: 'A devolução de carga perigosa requer tratamento especial via Gestão de Riscos.',
        source_document: { id: 'POL-001' },
      });

      expect(validateResponse(json).validated).toBe(true);
    });

    it('passa quando resposta menciona carga perigosa sem mencionar devolução', () => {
      const json = makeCompletion({
        answer: 'Carga perigosa exige documentação ANTT atualizada para transporte.',
        source_document: { id: 'PROC-042-v2' },
      });

      expect(validateResponse(json).validated).toBe(true);
    });

    it('passa quando resposta menciona devolução sem mencionar carga perigosa', () => {
      const json = makeCompletion({
        answer: 'O cliente pode solicitar a devolução em até 7 dias úteis conforme POL-001.',
        source_document: { id: 'POL-001', section: '§3.1' },
      });

      expect(validateResponse(json).validated).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  describe('falhas de parse JSON', () => {
    it('retorna fallback para string que não é JSON válido', () => {
      const result = validateResponse('isso não é json');

      expect(result.validated).toBe(false);
      expect(result.response).toEqual(FALLBACK_RESPONSE);
    });

    it('retorna fallback para string vazia', () => {
      const result = validateResponse('');

      expect(result.validated).toBe(false);
      expect(result.response).toEqual(FALLBACK_RESPONSE);
    });

    it('retorna fallback quando o modelo devolve JSON array em vez de objeto', () => {
      const result = validateResponse('["answer", "source_document"]');

      expect(result.validated).toBe(false);
      expect(result.response).toEqual(FALLBACK_RESPONSE);
    });
  });

  // -------------------------------------------------------------------------
  describe('falhas estruturais', () => {
    it('retorna fallback quando answer está ausente', () => {
      const json = JSON.stringify({ source_document: { id: 'POL-001' }, confidence_score: 0.9 });

      expect(validateResponse(json).validated).toBe(false);
    });

    it('retorna fallback quando answer é string vazia', () => {
      expect(validateResponse(makeCompletion({ answer: '' })).validated).toBe(false);
    });

    it('retorna fallback quando confidence_score é maior que 1', () => {
      expect(validateResponse(makeCompletion({ confidence_score: 1.1 })).validated).toBe(false);
    });

    it('retorna fallback quando confidence_score é negativo', () => {
      expect(validateResponse(makeCompletion({ confidence_score: -0.1 })).validated).toBe(false);
    });

    it('retorna fallback quando confidence_score está ausente', () => {
      const json = JSON.stringify({ answer: 'Resposta.', source_document: { id: 'POL-001' } });

      expect(validateResponse(json).validated).toBe(false);
    });
  });
});
