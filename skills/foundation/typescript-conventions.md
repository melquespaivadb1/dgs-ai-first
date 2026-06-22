# typescript-conventions

<!-- frase-ativação: "crie um tipo", "adicione uma interface", "escreva uma função TypeScript", "como tipar X" -->
<!-- frequência: altíssima — toda geração de código TypeScript depende desta skill -->
<!-- owner: Tech Lead | revisão: Senior Devs -->

---

## Contexto

O projeto `novatech-assistant` usa TypeScript com `"strict": true` e módulos ESNext com `"moduleResolution": "Bundler"` (ver `tsconfig.json`). Três consequências diretas para todo código gerado:

1. **`strict: true` não é suficiente sozinho.** Ele força tipagem, mas não define *como* os tipos são organizados, nomeados e importados. Esta skill preenche essa lacuna com convenções sociais que o compilador não consegue impor.

2. **Geração assistida por IA amplifica inconsistências.** Sem convenções explícitas, cada sessão com Claude Code ou Copilot pode gerar padrões ligeiramente diferentes — `interface` vs `type`, `any` vs `unknown`, `.then()` vs `await`. O acúmulo dessas micro-divergências ao longo de 3 meses de projeto cria atrito de revisão e confusão para novos membros.

3. **Os tipos de domínio já existem em `src/shared/types.ts`.** Qualquer código gerado deve importar dali, não redefinir tipos ad-hoc em handlers ou validators.

**Referência canônica do projeto:**
- Tipos de domínio: `src/shared/types.ts`
- Erros: `src/shared/errors.ts`
- Config: `src/shared/config.ts`
- Logger: `src/shared/logger.ts`
- Exemplo de handler completo: `src/functions/query/handler.ts`
- Exemplo de validator: `src/functions/query/validator.ts`

---

## Regras prescritivas

### R1 · Nomenclatura

| Categoria | Convenção | Exemplo |
|---|---|---|
| Tipos / Interfaces de domínio | PascalCase | `QueryRequest`, `SearchChunk`, `BuiltPrompt` |
| Tipos estruturais / funcionais | PascalCase | `QueryHandlerDeps`, `CreateHandlerFn` |
| Funções e variáveis | camelCase | `parseQueryRequest`, `buildPrompt`, `embedding` |
| Constantes de módulo | SCREAMING_SNAKE_CASE | `MAX_CHUNKS`, `DEFAULT_TOP_K` |
| Nomes de arquivo | kebab-case | `response-builder.ts`, `prompt-builder.ts` |
| Pastas de Azure Function | kebab-case | `query/`, `feedback/`, `health/` |
| Variáveis de ambiente | SCREAMING_SNAKE_CASE | `AZURE_OPENAI_ENDPOINT`, `AZURE_SEARCH_KEY` |

### R2 · `interface` vs `type`

- Use **`interface`** para tipos que descrevem *formas de dados de domínio* — os shapes que trafegam entre camadas (request, response, chunk, resultado de embedding). Esses tipos vivem em `src/shared/types.ts`.
- Use **`type`** para tipos estruturais que descrevem *dependências funcionais*, unions, interseções ou aliases locais de um módulo.

> **Regra de bolso:** se o tipo vai para `src/shared/types.ts`, é `interface`. Se fica no arquivo que o usa, é `type`.

### R3 · `import type` para importações de tipo

Toda importação usada apenas em posição de tipo deve usar `import type`. Isso é obrigatório com `"moduleResolution": "Bundler"` para garantir que o bundler elimine as importações de tipo corretamente.

### R4 · Extensão `.js` em imports relativos

O projeto usa ESM nativo (`"module": "ESNext"`). TypeScript resolve `.ts` → `.js` em tempo de compilação, mas o *import declarado no fonte* deve ter extensão `.js`. Nunca omita a extensão em imports relativos.

### R5 · Return types explícitos em funções exportadas

Toda função `export`ada deve ter return type declarado explicitamente — incluindo o tipo interno de funções que retornam funções (factory pattern). Funções internas (não exportadas) podem inferir.

### R6 · `unknown` para inputs externos, nunca `any`

O body de qualquer requisição HTTP é `unknown` até ser validado. Validators (Zod) são a única fronteira onde `unknown` é narrowado para um tipo concreto. Nunca use `any` para "passar pelo compilador" — use `unknown` e trate o narrowing.

### R7 · `async/await` exclusivo — sem `.then()/.catch()`

Toda operação assíncrona usa `async/await`. O padrão `.then().catch()` é proibido. Exceção única: callbacks de bibliotecas externas que exigem a forma `.then()` por contrato de API.

### R8 · Named exports — sem `export default`

Todos os símbolos exportados usam named export. `export default` é proibido no projeto.

> **Por quê:** `export default` dificulta rename automático no IDE, busca por símbolo e rastreamento de quem importa o quê. O Azure Functions v4 não exige default export.

### R9 · Ordem de imports

```
// Grupo 1: SDK Azure e Node built-ins
// Grupo 2: pacotes externos (zod, pino)
// Grupo 3: src/shared/ (caminhos relativos com .js)
// Grupo 4: imports relativos do mesmo módulo (./)
```

Separar cada grupo por uma linha em branco.

### R10 · Factory function para injeção de dependência em handlers

Handlers de Azure Functions são criados via factory function que recebe as dependências como parâmetro (`deps`). Isso permite testar o handler com stubs sem mocks de módulo.

---

## Exemplos DO / DON'T

### Tipos de domínio — onde vivem e como são declarados

```typescript
// ❌ DON'T — tipo ad-hoc criado dentro do handler
// src/functions/query/handler.ts
interface queryReq {             // casing errado
  question: string,              // vírgula, não ponto-e-vírgula
  userId: any,                   // any proibido
  topK?: number
}

async function handler(req: queryReq) {
  // ...
}
```

```typescript
// ✅ DO — tipos de domínio em src/shared/types.ts, interface + PascalCase
// src/shared/types.ts
export interface QueryRequest {
  question: string;
  sessionId?: string;
}

export interface SearchChunk {
  chunkId: string;
  content: string;
  score: number;
  sourceDocument: string;
  vigencia: string | null;
}

export interface QueryResponse {
  answer: string;
  sourceDocument: string | null;
}
```

---

### `interface` vs `type` — quando usar cada um

```typescript
// ❌ DON'T — usando interface para dependências funcionais de um handler
// src/functions/query/handler.ts
interface QueryHandlerDeps {          // funcional/estrutural → deveria ser type
  generateEmbedding: (q: string) => Promise<EmbeddingResult>;
  searchChunks: (v: number[]) => Promise<SearchChunk[]>;
}

// ❌ DON'T — usando type para tipo de domínio
// src/shared/types.ts
type SearchChunk = {                   // domínio → deveria ser interface
  chunkId: string;
  // ...
};
```

```typescript
// ✅ DO — interface para domínio (em shared/types.ts)
// src/shared/types.ts
export interface SearchChunk {
  chunkId: string;
  content: string;
  score: number;
  sourceDocument: string;
  vigencia: string | null;
}

// ✅ DO — type para dependência funcional (local ao handler)
// src/functions/query/handler.ts
export type QueryHandlerDeps = {
  generateEmbedding: (question: string) => Promise<EmbeddingResult>;
  searchChunks: (vector: number[]) => Promise<SearchChunk[]>;
  buildPrompt: (question: string, chunks: SearchChunk[]) => Promise<BuiltPrompt>;
  generateCompletion: (prompt: BuiltPrompt) => Promise<string>;
  buildResponse: (answer: string, chunks: SearchChunk[]) => QueryResponse;
};
```

---

### `import type` e extensão `.js`

```typescript
// ❌ DON'T — import de tipo sem `import type`, extensão omitida
import { QueryRequest, SearchChunk } from '../../shared/types';    // sem .js
import { logger } from '../../shared/logger';                      // sem .js
```

```typescript
// ✅ DO — import type para tipos, extensão .js obrigatória
import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';

import { logger } from '../../shared/logger.js';
import { CompletionError, SearchError, ValidationError } from '../../shared/errors.js';
import type { BuiltPrompt, EmbeddingResult, QueryResponse, SearchChunk } from '../../shared/types.js';

import { parseQueryRequest } from './validator.js';
```

---

### `unknown` para input externo — nunca `any`

```typescript
// ❌ DON'T — cast direto para any ou para o tipo de destino sem validação
export async function queryHandler(request: HttpRequest): Promise<HttpResponseInit> {
  const body = (await request.json()) as QueryRequest;  // cast sem validação
  const question = body.question;                       // pode explodir em runtime
  // ...
}
```

```typescript
// ✅ DO — unknown até a fronteira de validação Zod, narrowing explícito
// src/functions/query/validator.ts
export function parseQueryRequest(body: unknown): QueryRequest {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(result.error.issues[0].message);
  }
  return result.data;   // agora é QueryRequest com garantia
}

// src/functions/query/handler.ts
let body: unknown;
try {
  body = await request.json();
} catch {
  return { status: 400, jsonBody: { error: 'invalid request body' } };
}
const parsed = parseQueryRequest(body);  // único ponto de narrowing
```

---

### Return type explícito em funções exportadas

```typescript
// ❌ DON'T — return type ausente em função exportada
export async function buildPrompt(chunks, question) {    // parâmetros sem tipo
  return chunks.map(c => c.content).join('\n') + question;
}

// ❌ DON'T — factory sem tipo de retorno declarado
export function createQueryHandler(deps: QueryHandlerDeps) {
  return async (request, context) => {   // parâmetros sem tipo, retorno inferido
    // ...
  };
}
```

```typescript
// ✅ DO — parâmetros tipados, return type explícito
export async function buildPrompt(
  question: string,
  chunks: SearchChunk[],
): Promise<BuiltPrompt> {
  // ...
}

// ✅ DO — factory com return type completo
export function createQueryHandler(deps: QueryHandlerDeps) {
  return async (
    request: HttpRequest,
    _context: InvocationContext,
  ): Promise<HttpResponseInit> => {
    // ...
  };
}
```

---

### Named exports — sem `export default`

```typescript
// ❌ DON'T
export default async function handler(req: HttpRequest) { ... }
export default class QueryService { ... }
```

```typescript
// ✅ DO
export async function createQueryHandler(deps: QueryHandlerDeps) { ... }
export class QueryService { ... }
```

---

### `async/await` exclusivo

```typescript
// ❌ DON'T — .then()/.catch() misturado com async/await
export async function searchChunks(vector: number[]): Promise<SearchChunk[]> {
  return client.search(vector)
    .then(results => results.map(mapToChunk))
    .catch(err => { throw new SearchError('search failed', err); });
}
```

```typescript
// ✅ DO — async/await com try/catch
export async function searchChunks(vector: number[]): Promise<SearchChunk[]> {
  try {
    const results = await client.search(vector);
    return results.map(mapToChunk);
  } catch (err) {
    throw new SearchError('search failed', err);
  }
}
```

---

## Anti-padrões

### AP1 · `any` em parâmetros de handler

```typescript
// ❌ — Azure Functions HttpRequest já é tipado pelo SDK
export async function handler(req: any, ctx: any) { ... }
```

O SDK `@azure/functions` exporta `HttpRequest` e `InvocationContext`. Use sempre. `any` aqui desliga a checagem de tipos em toda a função.

---

### AP2 · Tipo de domínio definido fora de `src/shared/types.ts`

```typescript
// ❌ — type ad-hoc dentro de um handler
// src/functions/feedback/handler.ts
type FeedbackBody = { rating: number; comment: string };
```

Se o tipo descreve dados que trafegam entre camadas, ele pertence a `src/shared/types.ts`. Tipos espalhados por arquivos de handler criam divergências silenciosas quando o schema muda.

---

### AP3 · Import de tipo sem `import type`

```typescript
// ❌
import { QueryRequest } from '../../shared/types.js';  // usado só como tipo
```

Com `"moduleResolution": "Bundler"`, importar um tipo sem `import type` pode incluir o módulo no bundle desnecessariamente e gera aviso com `verbatimModuleSyntax` habilitado.

---

### AP4 · Omitir extensão `.js` em imports relativos

```typescript
// ❌
import { logger } from '../../shared/logger';
import { parseQueryRequest } from './validator';
```

Com ESM nativo, o runtime Node não resolve extensões automaticamente. A importação falha silenciosamente no build ou em runtime. **Sempre use `.js`** — o TypeScript resolve para o `.ts` correspondente em desenvolvimento.

---

### AP5 · Criar enums ao invés de union types literais

```typescript
// ❌ — enum gera código JavaScript extra e tem semântica confusa
enum ErrorCode {
  ValidationError = 'VALIDATION_ERROR',
  SearchError = 'SEARCH_ERROR',
}
```

```typescript
// ✅ — union de string literals: zero custo em runtime, totalmente apagada pelo compilador
type ErrorCode = 'VALIDATION_ERROR' | 'SEARCH_ERROR' | 'INTERNAL_ERROR';
```

---

### AP6 · `export default` em handlers

```typescript
// ❌ — dificulta rename automático e rastreamento de dependências
export default function handler(req: HttpRequest) { ... }
```

O Azure Functions v4 registra o handler via `app.http('name', { handler: fn })`. O nome da função exportada não precisa seguir nenhuma convenção do framework — use named exports.

---

### AP7 · Redefinir erros em vez de usar `src/shared/errors.ts`

```typescript
// ❌ — nova classe de erro ad-hoc dentro de um serviço
class ServiceError extends Error { ... }
```

O projeto tem `ValidationError`, `SearchError`, `EmbeddingError` e `CompletionError` em `src/shared/errors.ts`. Qualquer novo domínio de erro vai para lá — não para o arquivo que o originou.
