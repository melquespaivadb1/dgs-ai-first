# Code Review — `response-validator.ts`

**Commit:** `bb9e3e1`  
**Branch:** `cenario-3`  
**Arquivos:** `src/services/response-validator.ts`, `tests/unit/services/response-validator.test.ts`  
**Data:** 2026-06-27

---

## Resumo

| Categoria | Qtd | Status |
|---|---|---|
| Bugs | 2 | Bloqueia deploy |
| Coverage gaps | 8 | Prioridade alta |
| Design / ergonomia | 4 | Prioridade secundária |
| Integration (esperado) | 3 | Pendente de próxima sessão |
| **Total** | **17** | |

A arquitetura está sólida — schema Zod como controle estrutural, `.superRefine()` como caminho único para guardrails de conteúdo, retorno sempre seguro com fallback. Os 23 testes cobrem os cenários centrais. **BUG-01 e BUG-02 devem ser corrigidos antes do deploy.**

---

## Bugs

### BUG-01 — Guardrail 4.2 ignora o plural "cargas perigosas"

**Arquivo:** `response-validator.ts:26`

`lower.includes('carga perigosa')` não faz match em "cargas perigosas" — a forma mais natural quando o modelo generaliza sobre o tema. Uma resposta "cargas perigosas podem ser devolvidas mediante solicitação" passa o guardrail sem ser bloqueada.

Confirmado no HANDOFF como bug conhecido, mas o commit não trouxe a correção nem o teste de regressão.

```diff
- const mentionsDangerousCargo = lower.includes('carga perigosa');
+ const mentionsDangerousCargo = /cargas? perigosas?/.test(lower);
```

---

### BUG-02 — FALLBACK_RESPONSE é retornado por referência — mutável pelo caller

**Arquivo:** `response-validator.ts:57–63, 89, 100`

`validateResponse` retorna `{ response: FALLBACK_RESPONSE, validated: false }` entregando a **mesma referência ao objeto exportado**. Qualquer caller que modifique `result.response.answer` corrompe silenciosamente todos os fallbacks futuros.

```ts
// problema:
const { response } = validateResponse('json inválido');
response.answer = 'override acidental';
// FALLBACK_RESPONSE.answer agora é 'override acidental' em todas as chamadas seguintes
```

```diff
- return { response: FALLBACK_RESPONSE, validated: false };
+ return { response: { ...FALLBACK_RESPONSE,
+   source_document: { ...FALLBACK_RESPONSE.source_document } }, validated: false };
// alternativa: Object.freeze(FALLBACK_RESPONSE) na declaração
```

---

## Coverage Gaps

### GAP-01 — Plural "cargas perigosas" sem teste de regressão

**Arquivo:** `response-validator.test.ts`

O HANDOFF menciona que um `it` foi esboçado manualmente mas não consta no commit. Sem o teste, a correção do BUG-01 pode ser feita de forma incompleta e não regride.

```ts
it('bloqueia variante plural "cargas perigosas" sem negativa', () => {
  const json = makeCompletion({
    answer: 'Cargas perigosas podem ser devolvidas em até 7 dias.',
    source_document: { id: 'POL-001' },
  });
  expect(validateResponse(json).validated).toBe(false);
});
```

---

### GAP-02 — Guardrail 4.2 produz falso positivo para fraseamento correto alternativo

**Arquivo:** `response-validator.ts:31–42`

A lista `REQUIRED_NEGATION_TERMS` é um **mundo fechado** de 8 frases exatas. Um modelo que responda corretamente com "é **proibida**", "é **vedada**", "não é **permitida**", "não é **possível**" ou qualquer outra variante válida seria bloqueado mesmo estando correto. Sem testes que provem a fronteira, fica invisível quando o modelo adota essas frases.

```ts
// Respostas CORRETAS que seriam bloqueadas:
'A devolução de carga perigosa é proibida pelo regulamento ANTT.'
'Carga perigosa não pode ser devolvida por esta via.'
'A devolução de cargas perigosas é vedada pelo POL-001 §3.2.'
```

---

### GAP-03 — `section: ""` passa a validação

**Arquivo:** `response-validator.ts:12`

`z.string().optional()` aceita `section: ""` como válido. Uma string vazia seria propagada para o cliente como `"section": ""` em vez de simplesmente ausente.

```diff
- section: z.string().optional(),
+ section: z.string().min(1).optional(),
```

---

### GAP-04 — `answer` com apenas espaços em branco passa `min(1)`

**Arquivo:** `response-validator.ts:17`

`z.string().min(1)` valida comprimento de caracteres. `answer: "   "` tem `length === 3` e passa, gerando uma resposta visualmente em branco para o atendente.

```diff
- answer: z.string().min(1, 'Resposta não pode ser vazia'),
+ answer: z.string().min(1).trim().min(1, 'Resposta não pode ser vazia'),
```

---

### GAP-05 — JSON primitivos válidos (`null`, `42`, `true`) não testados

**Arquivo:** `response-validator.test.ts`

`JSON.parse("null")`, `JSON.parse("42")` e `JSON.parse("true")` são JSON válidos — não lançam exceção. O caminho correto é: `parsed = null/42/true` → `safeParse` → falha estrutural → fallback. Esse caminho existe mas não é coberto.

---

### GAP-06 — `confidence_score: NaN` e `Infinity` não testados

**Arquivo:** `response-validator.test.ts`

Zod rejeita `NaN` (falha em `min(0)`) e `Infinity` (falha em `max(1)`), mas sem testes explícitos esse comportamento é implícito, não contratual. Edge cases numéricos são especialmente relevantes quando a origem é um modelo de linguagem.

---

### GAP-07 — Mutação do `FALLBACK_RESPONSE` não tem teste de invariante

**Arquivo:** `response-validator.test.ts`

Não há teste que verifique se duas chamadas consecutivas com entrada inválida retornam o mesmo fallback intacto. Um teste de invariante faria o BUG-02 regredir automaticamente.

```ts
it('FALLBACK_RESPONSE permanece intacto entre chamadas', () => {
  const r1 = validateResponse('invalid');
  r1.response.answer = 'mutado';
  const r2 = validateResponse('also invalid');
  expect(r2.response).toEqual(FALLBACK_RESPONSE);
});
```

---

### GAP-08 — `source_document` como string primitiva não testado

**Arquivo:** `response-validator.test.ts`

O modelo poderia responder `"source_document": "POL-001"` (string em vez de objeto) — erro comum quando o system prompt não é explícito. O Zod rejeita, mas sem teste explícito isso é comportamento implícito, não contratual.

---

## Design e Ergonomia

### DES-01 — `ValidatedResponse` não é discriminated union

**Arquivo:** `response-validator.ts:69–72`

Com `validated: boolean`, o TypeScript não estreita os tipos dentro de um `if (result.validated)`. Uma discriminated union habilitaria narrowing automático.

```ts
// atual — sem narrowing
type ValidatedResponse = { response: AssistantResponse; validated: boolean; };

// sugerido
type ValidatedResponse =
  | { validated: true;  response: AssistantResponse }
  | { validated: false; response: typeof FALLBACK_RESPONSE; failureReason: FailureReason };
```

---

### DES-02 — Sem `failureReason` — métricas por guardrail são impossíveis

**Arquivo:** `response-validator.ts:69–72`

O HANDOFF lista como item pendente "#4 — métricas de fallback por tipo de guardrail". O caller só sabe que `validated: false`; não consegue distinguir parse error / guardrail 4.1 / guardrail 4.2 / falha estrutural sem parsear a mensagem de log. Adicionar `failureReason` ao tipo habilita essa feature sem nenhuma mudança de comportamento.

---

### DES-03 — `makeCompletion` não suporta deep merge

**Arquivo:** `response-validator.test.ts:6–13`

O helper usa spread raso. Passar `{ source_document: { id: 'X' } }` substitui o objeto inteiro, descartando o `section` padrão. Para testar "id válido com section customizada" é necessário repetir o id no override.

---

### DES-04 — `REQUIRED_NEGATION_TERMS` inlinado na closure

**Arquivo:** `response-validator.ts:31–40`

A lista está inlinada no `.superRefine()` sem referência à política base. Elevar para constante de módulo melhora rastreabilidade quando o time precisar adicionar ou remover termos.

```ts
// POL-001 §3.2 — termos que indicam encaminhamento correto para carga perigosa
const DANGEROUS_CARGO_NEGATION_TERMS = [
  'não são elegíveis',
  'não é elegível',
  // ...
] as const;
```

---

## Integration (pendente — esperado)

### INT-01 — `handler.ts` não chama `validateResponse`

**Arquivo:** `src/functions/query/handler.ts:48–52`

O handler ainda executa `deps.buildResponse(answer, chunks)` diretamente. Os guardrails estão implementados e testados mas inativos em produção.

---

### INT-02 — `mapToQueryResponse` não existe — incompatibilidade de tipos

**Arquivo:** `src/shared/types.ts:22–25`

`AssistantResponse.source_document` é `{ id: string; section?: string }`. `QueryResponse.sourceDocument` é `string | null`. A função de mapeamento referenciada no HANDOFF não existe. É necessário decidir o contrato de saída antes de integrar o handler.

---

### INT-03 — Stubs retornam plain text — quebrariam após integração

**Arquivo:** `src/functions/query/handler.ts:72`

O stub padrão de `generateCompletion` retorna `'Stub answer from default implementation.'`. Após integração do validator, `JSON.parse()` lançaria exceção e todos os testes com stub padrão passariam a retornar fallback.

```diff
- generateCompletion: async (_prompt) => 'Stub answer from default implementation.',
+ generateCompletion: async (_prompt) => JSON.stringify({
+   answer: 'Stub answer.',
+   source_document: { id: 'STUB-001' },
+   confidence_score: 1,
+ }),
```

---

## Cobertura de testes — resumo

| Cenário | Status |
|---|---|
| Happy path — JSON válido e completo | Coberto (5 testes) |
| Guardrail 4.1 — source_document ausente / id vazio / null | Coberto (3 testes) |
| Guardrail 4.2 — singular + devolução sem negativa | Coberto (7 testes) |
| Guardrail 4.2 — plural "cargas perigosas" | **Ausente** (BUG-01) |
| Guardrail 4.2 — falso positivo fraseamento alternativo | **Ausente** (GAP-02) |
| JSON parse — string inválida, vazia, array | Coberto (3 testes) |
| JSON parse — primitivos válidos (null, 42, true) | **Ausente** (GAP-05) |
| answer ausente / vazio | Coberto (2 testes) |
| answer com apenas espaços em branco | **Ausente** (GAP-04) |
| confidence_score fora de range (±) | Coberto (2 testes) |
| confidence_score: NaN / Infinity | **Ausente** (GAP-06) |
| section: "" (string vazia) | **Ausente** (GAP-03) |
| source_document como string primitiva | **Ausente** (GAP-08) |
| Mutação de FALLBACK_RESPONSE entre chamadas | **Ausente** (GAP-07) |
| Integração com handler.ts | Pendente (INT-01/02/03) |

---

## Veredicto

> **Aprovado com ressalvas — não deployar sem resolver BUG-01 e BUG-02.**
>
> BUG-01 é um bypass real do guardrail de segurança. BUG-02 é um time-bomb silencioso que se manifestaria em produção sob carga. Os GAPs de cobertura são prioridade secundária mas importantes para consolidar o contrato da função antes do wiring no handler.
