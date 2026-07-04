# CODE REVIEW `handler.ts`

## Violações do AGENTS.md

1. Uso indevido de console.log. Deveria ter usado `pino`.
2. Log de dados pessoais. O objeto feedback aprensenta o e-mail de um usuário. Dados pessoais não deveria ser logados
3. Request body não está validado utilizando o ZOD. 
4. Temos um import estático no meio do código. Deveria se encontrar no topo
5. Algumas constantes deveriam ser utilizada para os seguitnes valores: `novatech`, `feedbacks`
6. Novo arquivo sem testes. 