# Code Review — `src/functions/feedback/handler.ts`

**Branch:** `cenario-3`  
**Reviewed by:** Claude Code (high-effort, 8 finder angles × 10 verifiers)  
**Date:** 2026-07-04

---

## Findings (ranked by severity)

### 1. PII logged unconditionally — Security / AGENTS.md violation
**Line 16**

`JSON.stringify(feedback)` serializes the full object — including `attendantEmail` — and writes it to the log on every request.

```typescript
console.log('Feedback recebido:', JSON.stringify(feedback)); // leaks attendantEmail
```

**AGENTS.md rule violated:** _"Nunca logar dados pessoais (email, nome, etc)"_

**Fix:** Log only non-PII fields, and use the shared Pino logger (see finding #9).

```typescript
logger.info({ queryId: feedback.queryId, rating: feedback.rating }, 'Feedback recebido');
```

---

### 2. `request.json()` not wrapped in try/catch — Correctness
**Line 6**

A caller sending a malformed JSON body causes `request.json()` to reject with a `SyntaxError`. The rejection is unhandled, so the Azure Functions runtime returns an unstructured 500 instead of a clean 400.

```typescript
const body = await request.json() as any; // throws on malformed input
```

**Fix:** Mirror the pattern from `src/functions/query/handler.ts`:

```typescript
let body: unknown;
try {
  body = await request.json();
} catch {
  return { status: 400, jsonBody: { error: 'invalid request body' } };
}
```

---

### 3. `container.items.create()` not wrapped in try/catch — Correctness
**Line 23**

Any Cosmos DB failure (throttling, unavailability, constraint violation) propagates as an unhandled rejection. The caller receives a generic 500 with no structured error body and no log entry that distinguishes this failure from other errors.

```typescript
await container.items.create(feedback); // no error handling
```

**Fix:** Wrap in try/catch and return a structured error response.

---

### 4. `COSMOS_CONNECTION_STRING` not validated at startup — Correctness
**Line 19**

`process.env.COSMOS_CONNECTION_STRING` is read inside the handler body. If the env var is missing, the error only surfaces on the first real invocation with an opaque constructor error.

The project's existing pattern (`src/shared/config.ts`) uses `requireEnv()` which throws at **module initialisation time**, causing the host to refuse to start before any traffic is served.

```typescript
const client = new CosmosClient(process.env.COSMOS_CONNECTION_STRING); // undefined if var missing
```

**Fix:** Add `COSMOS_CONNECTION_STRING` to `src/shared/config.ts` and reference `config.cosmosConnectionString`.

---

### 5. Missing `authLevel` on `app.http()` registration — Availability
**Line 28**

`authLevel` is omitted. In Azure Functions v4 this defaults to `'function'` (requires a function key). The query handler explicitly sets `authLevel: 'anonymous'`. If the project intends open access, all production requests to `POST /api/feedback` will fail with **401**.

```typescript
app.http('feedback', {
  methods: ['POST'],
  // authLevel missing — defaults to 'function'
  handler: feedbackHandler
});
```

**Fix:** Add `authLevel: 'anonymous'` (or the intended level) explicitly.

---

### 6. No input validation — Data integrity / AGENTS.md violation
**Line 6**

The body is cast to `any` and fields are written directly to Cosmos with no schema check. Invalid inputs (missing `queryId`, non-numeric `rating`, injection strings in `comment`) are silently persisted.

```typescript
const body = await request.json() as any; // no Zod schema
```

**AGENTS.md rule violated:** _"Sempre utilize Zod para validação de input"_

**Fix:** Define a Zod schema and validate before writing:

```typescript
import { z } from 'zod';

const FeedbackSchema = z.object({
  queryId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
  attendantEmail: z.string().email(),
});
```

---

### 7. Dynamic `require()` inside handler — Reliability / AGENTS.md violation
**Line 18**

`require('@azure/cosmos')` is called inside the async handler body, not at the top of the module.

```typescript
const { CosmosClient } = require('@azure/cosmos'); // inside handler
```

**AGENTS.md rule violated:** _"Imports estáticos sempre no topo. Nunca utilize require dinâmico"_

A missing or partially-deployed package only errors at **invocation time**, bypassing startup health checks. Static imports fail fast at process start.

**Fix:**
```typescript
import { CosmosClient } from '@azure/cosmos';
```

---

### 8. `CosmosClient` instantiated per request — Reliability / Efficiency
**Lines 18–21**

A new `CosmosClient` (and its underlying TCP connection pool) is created on every HTTP invocation. Under concurrent load this exhausts ephemeral ports and hits Cosmos's per-client connection cap, causing `ECONNRESET` or throttling errors.

The Azure Cosmos SDK documentation explicitly requires creating the client **once** and reusing it across invocations.

**Fix:** Hoist to module scope:

```typescript
const client = new CosmosClient(config.cosmosConnectionString);
const container = client.database('novatech').container('feedbacks');
```

---

### 9. `console.log` instead of Pino logger — Convention / AGENTS.md violation
**Line 16**

```typescript
console.log('Feedback recebido:', JSON.stringify(feedback));
```

**AGENTS.md rule violated:** _"Para geração de logs, sempre utilize Pino. Nunca utilize `console.log`"_

`console.log` ignores `LOG_LEVEL`, is never silenced in test mode, and emits unstructured plain text instead of JSON — breaking log aggregators. The shared `logger` from `src/shared/logger.ts` handles all of this correctly.

**Fix:**
```typescript
import { logger } from '../../shared/logger.js';
// ...
logger.info({ queryId: feedback.queryId, rating: feedback.rating }, 'Feedback recebido');
```

---

### 10. No `id` field on Cosmos item — Design
**Line 8**

The feedback object has no `id` field. The Cosmos SDK auto-generates a random GUID, so the stored document's `id` has no relationship to `queryId`. Any downstream lookup of a feedback record by `queryId` requires an expensive cross-partition query scan instead of a direct point-read.

**Fix:** Set `id` to a deterministic value:

```typescript
const feedback = {
  id: body.queryId, // enables O(1) point-reads by queryId
  ...
};
```

---

## Summary table

| # | Line | Severity | Category | Issue |
|---|------|----------|----------|-------|
| 1 | 16 | Critical | Security | PII (`attendantEmail`) logged — AGENTS.md |
| 2 | 6 | High | Correctness | `request.json()` unwrapped → 500 on bad input |
| 3 | 23 | High | Correctness | `container.items.create()` unwrapped → 500 on Cosmos failure |
| 4 | 19 | High | Correctness | `COSMOS_CONNECTION_STRING` not guarded → crash at invocation time |
| 5 | 28 | High | Availability | Missing `authLevel` → 401 in production |
| 6 | 6 | High | Data integrity | No Zod validation → garbage persisted — AGENTS.md |
| 7 | 18 | Medium | Reliability | Dynamic `require()` → deferred module errors — AGENTS.md |
| 8 | 19 | Medium | Reliability | `CosmosClient` per-request → connection exhaustion |
| 9 | 16 | Low | Convention | `console.log` instead of Pino — AGENTS.md |
| 10 | 8 | Low | Design | No `id` field → queryId-based lookups require scans |

**AGENTS.md violations (must fix before merge):** findings 1, 6, 7, 9
