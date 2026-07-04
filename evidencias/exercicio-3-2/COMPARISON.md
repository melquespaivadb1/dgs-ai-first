# Comparação de Code Reviews — `handler.ts`

**Minha revisão:** `MY_CODE_REVIEW.md`  
**Revisão do Claude Code:** `CODE_REVIEW.md`  
**Data:** 2026-07-04

---

## Findings em comum (ambas as revisões identificaram)

| Meu finding | Finding do Claude | Problema |
|---|---|---|
| #1 — `console.log` ao invés de Pino | #9 | Violação do AGENTS.md: "Nunca utilize `console.log`" |
| #2 — PII logado (e-mail do atendente) | #1 | `attendantEmail` exposto nos logs — violação do AGENTS.md |
| #3 — Sem validação Zod no request body | #6 | Violação do AGENTS.md: "Sempre utilize Zod para validação de input" |
| #4 — `require()` dinâmico dentro do handler | #7 | Violação do AGENTS.md: "Imports estáticos sempre no topo" |

---

## Eu identifiquei, o Claude não listou no top-10

| Meu finding | Impacto |
|---|---|
| **#5 — Strings hardcoded** `'novatech'` e `'feedbacks'` | Um ambiente de staging com nome de database diferente escreveria no container errado silenciosamente. O Claude identificou durante a análise, mas o finding foi descartado ao priorizar os 10 mais severos. |
| **#6 — Nenhum teste para o novo arquivo** | O arquivo entra em produção sem cobertura de testes. O Claude não sinalizou pois a seção `Testing Standards` do AGENTS.md está marcada como `TODO`. |

---

## Claude identificou, eu não sinalizei

| Finding do Claude | Severidade | Impacto |
|---|---|---|
| **#2 — `request.json()` sem try/catch** | Alta | Qualquer body malformado gera um 500 não estruturado em vez de um 400 limpo. O `query/handler.ts` envolve essa chamada em try/catch explicitamente. |
| **#3 — `container.items.create()` sem try/catch** | Alta | Qualquer falha do Cosmos (throttle, indisponibilidade) vira uma rejeição não tratada — sem body de erro estruturado, sem log diferenciado. |
| **#4 — `COSMOS_CONNECTION_STRING` sem validação na inicialização** | Alta | A variável ausente só explode na primeira invocação real com erro opaco. O padrão `requireEnv()` de `config.ts` lançaria o erro na **inicialização do processo**, antes de qualquer tráfego. |
| **#5 — `authLevel` ausente no `app.http()`** | Alta | Padrão do Azure Functions v4 é `'function'` (requer function key). O `query/handler.ts` define `authLevel: 'anonymous'` explicitamente. Se a intenção for acesso anônimo, todas as requisições em produção retornam **401**. |
| **#8 — `CosmosClient` instanciado por request** | Média | Cria um novo pool de conexões TCP a cada invocação. Sob carga, esgota portas efêmeras e dispara `ECONNRESET`. Deve ser um singleton no escopo do módulo. |
| **#10 — Sem campo `id` no documento do Cosmos** | Baixa | O SDK atribui um GUID aleatório sem relação com `queryId`. Buscas por `queryId` exigem queries cross-partition caras em vez de point-reads diretos. |

---

## Resumo

| | Minha revisão | Revisão do Claude |
|---|---|---|
| Total de findings | 6 | 10 |
| Violações AGENTS.md | 4 (todas corretas) | 4 (todas corretas) |
| Bugs de correctness / error handling | 0 | 3 (findings 2, 3, 4) |
| Problemas de infraestrutura/disponibilidade | 0 | 2 (findings 5, 8) |
| Findings exclusivos corretos | 2 (strings hardcoded, sem testes) | 6 (ver tabela acima) |

**Conclusão:** Minha revisão cobriu todas as **violações de AGENTS.md** corretamente e identificou dois pontos que o Claude não listou (strings hardcoded e ausência de testes). Os principais gaps foram os **bugs de error handling** (ausência de try/catch em `request.json()` e `container.items.create()`) e os **problemas de infraestrutura** (`authLevel` ausente, singleton do `CosmosClient`) — falhas de maior severidade que se manifestariam em produção.
