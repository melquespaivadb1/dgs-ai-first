# Tasks — Query Endpoint

> Gerado a partir de `specs/query-endpoint/plan.md`.
> Revisão pendente do Tech Lead antes de iniciar desenvolvimento.

---

## Dependências externas (bloqueantes)

Antes de iniciar qualquer task de implementação, confirmar:
- [ ] Pipeline de ingestão concluído e índice Azure AI Search populado (`specs/pipeline-ingestao/`)
- [ ] System prompt finalizado em `/prompts/system-prompt.md`

---

## Estratégia de implementação

As tasks seguem a abordagem **outside-in**: o endpoint HTTP é implementado em QE-003 com stubs para os serviços, entregando um endpoint funcional logo no início. Os serviços reais (QE-004–QE-008) satisfazem os contratos definidos no handler via injeção de dependência e podem ser desenvolvidos em **qualquer ordem ou em paralelo**. QE-009 conecta as implementações reais e valida o pipeline completo.

```
QE-001 ──► QE-002 ──► QE-003 ──────────────────────────┐
                │                                       │
                ├──► QE-004 ──┐                         │
                ├──► QE-005   ├──────────────────► QE-009
                ├──► QE-006   │                         │
                ├──► QE-007   │                         │
                └──► QE-008 ──┘                         │
```

---

## Resumo das tasks

| ID | Descrição | Deps | Estimativa |
|---|---|---|---|
| QE-001 | Setup: tipos, config, logger e erros | — | M |
| QE-002 | Fixtures de teste compartilhadas | QE-001 | S |
| QE-003 | Handler HTTP: contrato, validação e stubs | QE-001, QE-002 | M |
| QE-004 | Serviço de embedding (Azure OpenAI) | QE-001, QE-002 | M |
| QE-005 | Serviço de busca vetorial (Azure AI Search) | QE-001, QE-002 | M |
| QE-006 | Prompt builder com context budget | QE-001, QE-002 | M |
| QE-007 | Serviço de completion com GPT-4o | QE-001, QE-002 | M |
| QE-008 | Response builder com source_document | QE-001, QE-002 | S |
| QE-009 | Assembly: serviços reais conectados ao handler | QE-003–008 | S |

> QE-003 e QE-004–QE-008 são independentes entre si e podem ser desenvolvidos em paralelo após QE-002.

---

## Tasks

---

### QE-001 — Setup: tipos, config, logger e erros

**Arquivos:** `src/shared/types.ts`, `src/shared/config.ts`, `src/shared/logger.ts`, `src/shared/errors.ts`, `tests/unit/shared/config.test.ts`, `tests/unit/shared/logger.test.ts`, `tests/unit/shared/errors.test.ts`

**Descrição:**
Criar toda a infraestrutura compartilhada que as demais tasks consomem: tipos de domínio, leitura de variáveis de ambiente, logger estruturado e classes de erro tipadas. Estes quatro artefatos são fundacionais — nenhuma outra task pode ser iniciada sem eles.

**Critérios de aceite:**

*Tipos (`types.ts`):*
- `QueryRequest` possui `question: string` (obrigatório) e `sessionId?: string` (opcional), sem uso de `any`.
- `SearchChunk` possui `chunkId: string`, `content: string`, `score: number`, `sourceDocument: string` e `vigencia: string | null` (metadado da ADR-0003).
- `BuiltPrompt` possui `systemMessage: string`, `userMessage: string` e `estimatedTokens: number`.
- `QueryResponse` possui `answer: string` e `sourceDocument: string | null`.
- `EmbeddingResult` possui `vector: number[]` e `tokenCount: number`.

*Config (`config.ts`):*
- Lê as variáveis `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_KEY`, `AZURE_OPENAI_DEPLOYMENT_CHAT`, `AZURE_OPENAI_DEPLOYMENT_EMBEDDING`, `AZURE_SEARCH_ENDPOINT`, `AZURE_SEARCH_KEY` e `AZURE_SEARCH_INDEX_NAME` de `process.env`.
- Se qualquer variável obrigatória estiver ausente no momento do import, lança `Error` com a mensagem `"Missing required environment variable: <NOME>"`, antes de qualquer chamada de rede ou I/O.
- Exporta um objeto `config` com todas as variáveis tipadas como `string` (sem `string | undefined`).
- Teste: import com `AZURE_OPENAI_ENDPOINT` ausente → lança `Error` com mensagem `"Missing required environment variable: AZURE_OPENAI_ENDPOINT"`.
- Teste: import com todas as variáveis presentes → exporta `config` com os valores corretos.

*Logger (`logger.ts`):*
- Exporta os métodos `info`, `warn`, `error` e `debug` com as assinaturas padrão do pino.
- Com `NODE_ENV=production`, cada linha emitida para `stdout` é JSON válido com os campos `level`, `time` e `msg`.
- O nível mínimo é controlado por `LOG_LEVEL`; padrão `"info"` quando ausente.
- Com `NODE_ENV=test`, o logger não emite nada para `stdout` nem `stderr`.
- Teste: com `NODE_ENV=test`, chamar `logger.info("x")` resulta em 0 chamadas a `process.stdout.write`.
- Teste: com `LOG_LEVEL=debug`, `logger.debug("x")` emite; com `LOG_LEVEL=warn`, não emite.

*Erros (`errors.ts`):*
- Existem as classes `ValidationError`, `EmbeddingError`, `SearchError` e `CompletionError`, todas estendendo `Error`.
- Cada classe define `this.name = "<NomeDaClasse>"` para que `error.name` seja correto em ambientes minificados.
- Cada classe aceita `message: string` e `cause?: unknown`; quando `cause` é fornecido, é acessível em `error.cause`.
- Prototype chain preservado via `Object.setPrototypeOf(this, new.target.prototype)`.
- Teste: `new SearchError("msg") instanceof SearchError` retorna `true`.
- Teste: `new SearchError("msg") instanceof Error` retorna `true`.
- Teste: `new CompletionError("msg", originalErr).cause` é igual a `originalErr`.
- Teste: `new EmbeddingError("msg").name` é `"EmbeddingError"`.

*Geral:*
- `tsc --noEmit` compila os quatro arquivos com `strict: true` sem erros.
- `vitest run tests/unit/shared` termina com todos os testes passando e exit code 0.

**Dependências:** nenhuma

**Estimativa:** M

---

### QE-002 — Criar fixtures de teste compartilhadas

**Arquivos:** `tests/fixtures/chunks.ts`, `tests/fixtures/queries.ts`, `tests/fixtures/expected-responses.ts`

**Descrição:**
Criar os dados de teste reutilizáveis compartilhados entre todos os testes do query endpoint. Esta task desbloqueia a escrita de testes em QE-003–QE-008.

**Critérios de aceite:**
- `tests/fixtures/chunks.ts` exporta `mockChunks: SearchChunk[]` com ao menos 6 itens contendo: scores distintos (incluindo ao menos um empate), `sourceDocument` variados, ao menos um item com `vigencia: null` e outro com `vigencia` preenchida.
- `tests/fixtures/queries.ts` exporta `mockQueries` com ao menos 5 strings cobrindo: string vazia, string de 1 caractere, string típica (~50 chars), string com exatamente 500 chars, string com 501 chars.
- `tests/fixtures/expected-responses.ts` exporta ao menos 3 objetos `QueryResponse` com `answer` e `sourceDocument` definidos.
- Todos os fixtures são tipados com os tipos de `src/shared/types.ts`; nenhum usa type assertion (`as`).
- `tsc --noEmit` compila os três arquivos sem erros.

**Dependências:** QE-001

**Estimativa:** S

---

### QE-003 — Handler HTTP: contrato, validação e stubs

**Arquivos:** `src/functions/query/handler.ts`, `src/functions/query/validator.ts`, `tests/integration/query/handler.test.ts`

**Descrição:**
Implementar o handler do query endpoint com injeção de dependência via `createQueryHandler(deps)`, o validador de input com Zod e stubs funcionais para todos os serviços. Ao final desta task o endpoint está funcional e deployável, respondendo com dados stubados. Os testes validam o **contrato HTTP** — roteamento, validação, mapeamento de erros e logging — independentemente da lógica de cada serviço.

**Critérios de aceite:**

*Contrato de injeção de dependência:*
- O tipo `QueryHandlerDeps` é exportado de `handler.ts` com os campos:
  - `generateEmbedding: (question: string) => Promise<EmbeddingResult>`
  - `searchChunks: (vector: number[]) => Promise<SearchChunk[]>`
  - `buildPrompt: (question: string, chunks: SearchChunk[]) => Promise<BuiltPrompt>`
  - `generateCompletion: (prompt: BuiltPrompt) => Promise<string>`
  - `buildResponse: (answer: string, chunks: SearchChunk[]) => QueryResponse`
- A função `createQueryHandler(deps: QueryHandlerDeps)` é exportada e retorna um HTTP handler Azure Functions v4.
- A Azure Function é registrada com `app.http('query', ...)` usando `createQueryHandler` com os stubs como deps padrão.

*Validador (`validator.ts`):*
- `parseQueryRequest(body: unknown): QueryRequest` é exportado.
- Body com `question` ausente → lança `ValidationError` com mensagem identificando o campo.
- Body com `question: ""` → lança `ValidationError` com mensagem `"question is required and cannot be empty"`.
- Body com `question` > 500 chars → lança `ValidationError` com mensagem `"question must be at most 500 characters"`.
- Campos extras são silenciosamente ignorados (strip, não strict).

*Handler:*
- POST `/api/query` com body inválido → HTTP 400 com `{ "error": "<mensagem>" }`, sem chamar nenhum dep.
- POST `/api/query` com body válido e stubs → HTTP 200 com `{ "answer": "...", "sourceDocument": "..." }`.
- Dep que lança `EmbeddingError`, `SearchError` ou `CompletionError` → HTTP 502 com `{ "error": "upstream_failure" }`; erro original logado em nível `error`.
- Dep que lança erro não tipado → HTTP 500 com `{ "error": "internal_error" }`; stack trace logado em nível `error`.
- Cada etapa emite log `info` com os campos `step` (`"embedding"`, `"search"`, `"prompt_build"`, `"completion"`) e `durationMs`.
- `tsc --noEmit` compila `handler.ts` e `validator.ts` sem erros.

*Testes de integração (com stubs):*
- Teste: POST com `question` válida e stubs retornando dados de `tests/fixtures/` → HTTP 200 com `answer` e `sourceDocument` presentes.
- Teste: POST com `question: ""` → HTTP 400; nenhum dep chamado (contador de invocações = 0).
- Teste: POST com `question` de 501 chars → HTTP 400; nenhum dep chamado.
- Teste: stub de `generateEmbedding` lançando `EmbeddingError` → HTTP 502 com `{ "error": "upstream_failure" }`.
- Teste: stub de `searchChunks` lançando `SearchError` → HTTP 502 com `{ "error": "upstream_failure" }`.
- Teste: stub de `generateCompletion` lançando `CompletionError` → HTTP 502 com `{ "error": "upstream_failure" }`.
- Teste: stub de `searchChunks` retornando `[]` → HTTP 200 com `sourceDocument: null`.
- Teste: stub lançando `new Error("unexpected")` → HTTP 500 com `{ "error": "internal_error" }`.
- `vitest run tests/integration/query/handler.test.ts` termina com todos os testes passando e exit code 0.

**Dependências:** QE-001, QE-002

**Estimativa:** M

---

### QE-004 — Implementar serviço de embedding com retry

**Arquivos:** `src/services/completion.ts` (função `generateEmbedding`), `tests/unit/services/embedder.test.ts`

**Descrição:**
Implementar `generateEmbedding`, satisfazendo o contrato `QueryHandlerDeps.generateEmbedding`. Converte a pergunta em vetor de embedding via Azure OpenAI com retry automático e exponential backoff.

**Critérios de aceite:**
- `generateEmbedding(question: string): Promise<EmbeddingResult>` retorna `EmbeddingResult` com `vector: number[]` de dimensão não-zero e `tokenCount: number > 0`.
- Em resposta HTTP 5xx ou timeout, retenta até 3 vezes com delays de 1 000 ms, 2 000 ms e 4 000 ms antes de lançar `EmbeddingError`.
- Em resposta HTTP 429, o delay antes do retry é o valor inteiro do header `Retry-After` em segundos quando presente; caso ausente, aplica o backoff padrão.
- Em resposta HTTP 4xx (exceto 429), lança `EmbeddingError` imediatamente sem retry.
- `EmbeddingError` é lançado com `cause` apontando para o erro original.
- `tsc --noEmit` compila o módulo sem erros.
- Teste: API retorna 200 na primeira tentativa → retorna `EmbeddingResult` correspondente ao mock.
- Teste: API retorna 503 nas duas primeiras tentativas e 200 na terceira → retorna `EmbeddingResult` após exatamente 3 chamadas HTTP.
- Teste: API retorna 503 nas três tentativas → lança `EmbeddingError` após exatamente 3 chamadas HTTP.
- Teste: API retorna 400 → lança `EmbeddingError` com exatamente 1 chamada HTTP (sem retry).
- Teste: API retorna 429 com `Retry-After: 2` → delay antes do retry é >= 2 000 ms (fake timers).
- Todos os testes usam mocks HTTP, sem chamada de rede real.
- `vitest run tests/unit/services/embedder.test.ts` termina com todos os testes passando e exit code 0.

**Dependências:** QE-001, QE-002

**Estimativa:** M

---

### QE-005 — Implementar serviço de busca vetorial no Azure AI Search

**Arquivos:** `src/services/search.ts`, `tests/unit/services/search.test.ts`

**Descrição:**
Implementar `searchChunks`, satisfazendo o contrato `QueryHandlerDeps.searchChunks`. Realiza busca vetorial no Azure AI Search retornando os top-5 chunks mais relevantes.

**Critérios de aceite:**
- `searchChunks(vector: number[]): Promise<SearchChunk[]>` retorna array com no máximo 5 itens ordenados por `score` descendente.
- Cada item mapeia `chunkId`, `content`, `score`, `sourceDocument` e `vigencia` dos campos correspondentes no índice.
- Quando o índice retorna 0 resultados, retorna `[]` sem lançar exceção.
- Em resposta HTTP 5xx ou timeout, retenta até 3 vezes com delays de 1 000 ms, 2 000 ms e 4 000 ms antes de lançar `SearchError`.
- Em resposta HTTP 4xx (exceto 429), lança `SearchError` imediatamente sem retry.
- `SearchError` é lançado com `cause` apontando para o erro original.
- `tsc --noEmit` compila o módulo sem erros.
- Teste: API retorna 5 chunks → retorna array de 5 `SearchChunk` na ordem de `score` descendente.
- Teste: API retorna 0 chunks → retorna `[]` sem lançar exceção.
- Teste: API retorna 503 nas duas primeiras tentativas e 200 na terceira → retorna chunks após exatamente 3 chamadas HTTP.
- Teste: API retorna 503 nas três tentativas → lança `SearchError` após exatamente 3 chamadas HTTP.
- Teste: API retorna 400 → lança `SearchError` com exatamente 1 chamada HTTP.
- Todos os testes usam mocks HTTP, sem chamada de rede real.
- `vitest run tests/unit/services/search.test.ts` termina com todos os testes passando e exit code 0.

**Dependências:** QE-001, QE-002

**Estimativa:** M

---

### QE-006 — Implementar prompt builder respeitando context budget (ADR-0002)

**Arquivos:** `src/services/prompt-builder.ts`, `tests/unit/services/prompt-builder.test.ts`

**Descrição:**
Implementar `buildPrompt`, satisfazendo o contrato `QueryHandlerDeps.buildPrompt`. Monta o `BuiltPrompt` com o system prompt, os chunks e a pergunta, respeitando o orçamento de contexto da ADR-0002 (~4 096 tokens para system message, ~8 192 para chunks).

**Critérios de aceite:**
- `buildPrompt(question: string, chunks: SearchChunk[]): Promise<BuiltPrompt>` retorna `BuiltPrompt` com `systemMessage`, `userMessage` e `estimatedTokens`.
- O system prompt é lido de `/prompts/system-prompt.md` a cada invocação; alterações no arquivo são refletidas sem reiniciar a função.
- Quando o conteúdo excede 4 096 tokens estimados (`Math.ceil(chars / 4)`), lança `Error` com mensagem `"System prompt exceeds context budget (4096 tokens)"`.
- Os chunks são incluídos em `userMessage` em ordem de `score` descendente até 8 192 tokens; chunks que ultrapassariam o limite são omitidos inteiramente, nunca truncados no meio.
- Quando `chunks` é vazio, `userMessage` contém somente a pergunta, sem seção de contexto ou placeholders.
- `estimatedTokens` reflete a soma das estimativas de `systemMessage` e `userMessage`.
- `tsc --noEmit` compila o módulo sem erros.
- Teste: 5 chunks dentro do limite → `userMessage` contém todos os 5; `estimatedTokens` é a soma correta.
- Teste: 6 chunks em que o 6º ultrapassaria o limite → `userMessage` contém apenas os 5 primeiros; o 6º está ausente completamente.
- Teste: `chunks` vazio → `userMessage` contém somente a pergunta, sem string `"contexto"` ou placeholder.
- Teste: system prompt acima de 4 096 tokens → lança `Error` com mensagem `"System prompt exceeds context budget (4096 tokens)"`.
- Teste: duas chamadas consecutivas com arquivo alterado entre elas → `systemMessage` difere entre as chamadas.
- `vitest run tests/unit/services/prompt-builder.test.ts` termina com todos os testes passando e exit code 0.

**Dependências:** QE-001, QE-002

**Estimativa:** M

---

### QE-007 — Implementar serviço de completion com GPT-4o e retry

**Arquivos:** `src/services/completion.ts` (função `generateCompletion`), `tests/unit/services/completion.test.ts`

**Descrição:**
Implementar `generateCompletion`, satisfazendo o contrato `QueryHandlerDeps.generateCompletion`. Envia o `BuiltPrompt` ao GPT-4o via Azure OpenAI com retry automático para falhas transitórias.

**Critérios de aceite:**
- `generateCompletion(prompt: BuiltPrompt): Promise<string>` retorna string não vazia com o conteúdo da resposta do modelo.
- A chamada usa `temperature: 0` e `max_tokens` lido de `COMPLETION_MAX_TOKENS` (padrão `1024` quando ausente).
- Em resposta HTTP 5xx ou timeout, retenta até 3 vezes com delays de 1 000 ms, 2 000 ms e 4 000 ms antes de lançar `CompletionError`.
- Em resposta HTTP 429, o delay respeita o header `Retry-After` quando presente; caso ausente, aplica o backoff padrão.
- Em resposta HTTP 4xx (exceto 429), lança `CompletionError` imediatamente sem retry.
- `CompletionError` é lançado com `cause` apontando para o erro original.
- `tsc --noEmit` compila o módulo sem erros.
- Teste: API retorna 200 na primeira tentativa → retorna a string correspondente ao mock.
- Teste: API retorna 503 uma vez e 200 na segunda → retorna string após exatamente 2 chamadas HTTP.
- Teste: API retorna 503 nas três tentativas → lança `CompletionError` após exatamente 3 chamadas HTTP.
- Teste: API retorna 400 → lança `CompletionError` com exatamente 1 chamada HTTP.
- Todos os testes usam mocks HTTP, sem chamada de rede real.
- `vitest run tests/unit/services/completion.test.ts` termina com todos os testes passando e exit code 0.

**Dependências:** QE-001, QE-002

**Estimativa:** M

---

### QE-008 — Implementar response builder com source_document

**Arquivos:** `src/functions/query/response-builder.ts`, `tests/unit/query/response-builder.test.ts`

**Descrição:**
Implementar `buildResponse`, satisfazendo o contrato `QueryHandlerDeps.buildResponse`. Função pura que monta a `QueryResponse` identificando o documento de maior relevância entre os chunks retornados.

**Critérios de aceite:**
- `buildResponse(answer: string, chunks: SearchChunk[]): QueryResponse` retorna objeto com `answer` e `sourceDocument`.
- `sourceDocument` é o valor `sourceDocument` do chunk com maior `score`; em caso de empate, o item no índice 0 é usado.
- Quando `chunks` é vazio, `sourceDocument` é `null`.
- A função é pura: não realiza I/O, não modifica os parâmetros e retorna o mesmo resultado para os mesmos inputs.
- `tsc --noEmit` compila o módulo sem erros.
- Teste: 5 chunks com scores distintos em ordem embaralhada → `sourceDocument` é o do chunk com maior score.
- Teste: 2 chunks com o mesmo score → `sourceDocument` é o do item no índice 0.
- Teste: 1 chunk → `sourceDocument` é o `sourceDocument` desse único chunk.
- Teste: `chunks` vazio → `sourceDocument` é `null`.
- Teste: o array `chunks` não é modificado pela função (comparação de referência antes e após a chamada).
- `vitest run tests/unit/query/response-builder.test.ts` termina com todos os testes passando e exit code 0.

**Dependências:** QE-001, QE-002

**Estimativa:** S

---

### QE-009 — Assembly: serviços reais conectados ao handler

**Arquivos:** `src/functions/query/index.ts`, `tests/integration/query/assembly.test.ts`

**Descrição:**
Conectar as implementações reais (QE-004–QE-008) ao handler via `createQueryHandler(deps)` e registrar a Azure Function. Os testes validam o pipeline completo com chamadas HTTP interceptadas por msw, verificando que retry, context budget e seleção de source document funcionam de forma integrada.

**Critérios de aceite:**
- `src/functions/query/index.ts` importa `createQueryHandler` e as cinco implementações reais, registrando a Azure Function com `app.http('query', ...)`.
- `tsc --noEmit` compila `index.ts` sem erros.
- Teste: POST com `question` válida → HTTP 200 com `answer` e `sourceDocument` derivados dos mocks msw (não de stubs).
- Teste: Azure Search retorna 503 três vezes → HTTP 502 após esgotar os retries do serviço real.
- Teste: Azure OpenAI embedding retorna 503 três vezes → HTTP 502.
- Teste: Azure OpenAI completion retorna 503 três vezes → HTTP 502.
- Teste: Azure Search retorna 0 resultados → HTTP 200 com `sourceDocument: null`.
- Todos os testes usam msw ou interceptores de fetch; nenhuma chamada de rede real é feita.
- `vitest run tests/integration/query/assembly.test.ts` termina com todos os testes passando e exit code 0, sem variáveis de ambiente Azure reais configuradas.

**Dependências:** QE-003, QE-004, QE-005, QE-006, QE-007, QE-008

**Estimativa:** S
