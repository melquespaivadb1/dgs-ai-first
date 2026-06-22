# Skills Architecture — NovaTech Assistant

**Documento:** SKL-001 · REV 01  
**Projeto:** NovaTech Assistant · db1/novatech-assistant  
**Tech Stack:** TypeScript · Azure Functions · React  
**Total de skills:** 19 (5 Foundation · 7 Domain · 7 Artifact)

> "Skills são artefatos estruturados que encapsulam como gerar tipos específicos de outputs. A hierarquia é Foundation (convenções globais) → Domain (padrões por camada) → Artifact (receitas de geração)."

---

## Hierarquia

```
Foundation  →  Domain  →  Artifact
(convenções globais)  (padrões por camada)  (receitas de geração)
```

Regra de dependência: Domain herda Foundation. Artifact consome Domain + Foundation. Nenhuma skill de camada superior pode contradizer uma de Foundation.

---

## 01 · Foundation

**Propósito:** Convenções globais — valem para todo o codebase, toda camada.  
**Owner primário:** Tech Lead  
**Frequência de mudança:** Rara — alto impacto, exige notificação para todo o time.

| Skill | Arquivo | O que define | Owner | Gatilho de atualização | Frase-ativação | Quem consome | Frequência de uso |
|---|---|---|---|---|---|---|---|
| `typescript-conventions` | `skills/foundation/typescript-conventions.md` | Strict mode, nomenclatura (PascalCase tipos, camelCase funções, SCREAMING_SNAKE constantes), import ordering, return types explícitos, padrões de generics | Tech Lead | Novo padrão TS adotado | "crie um tipo", "adicione uma interface", "escreva uma função TypeScript", "como tipar X" | Todos os Devs (referência) · Claude Code ao gerar qualquer código TypeScript | Altíssima — toda geração de código |
| `error-handling` | `skills/foundation/error-handling.md` | Hierarquia de CustomError (AppError → ValidationError, SearchError, CompletionError), mapeamento para HTTP status codes, padrão try/catch nos handlers, propagação de erros pelos serviços | Tech Lead | Novo domínio de erro no sistema | "trate o erro de X", "adicione error handling", "o que lançar quando Y falhar" | Dev Backend · Claude Code ao gerar handlers e services | Alta — todo handler e service gerado |
| `project-structure` | `skills/foundation/project-structure.md` | Onde cada artefato vive no repo (src/, tests/, specs/, skills/, docs/), convenções de nomenclatura de pastas e arquivos, como módulos referenciam src/shared/ sem dependências circulares | Tech Lead | Nova pasta ou convenção de path | "onde criar esse arquivo", "em qual pasta vai X", "como nomear o módulo de Y" | Todos os Devs · Claude Code ao criar novos arquivos ou módulos | Média — a cada criação de novo módulo |
| `logging` | `skills/foundation/logging.md` | Setup do pino logger em src/shared/logger.ts, campos obrigatórios (requestId, module, correlationId), níveis por ambiente (debug em local, info em prod), formato JSON estruturado | Senior Dev | Novo campo obrigatório de observabilidade | "instrumente esta função", "adicione log aqui", "registre a chamada para X" | Dev Backend · Claude Code ao gerar handlers e services | Alta — todo handler e service gerado |
| `env-config` | `skills/foundation/env-config.md` | Padrão config.ts com validação Zod no startup, variáveis obrigatórias por módulo (Azure AI Search, OpenAI, Cosmos DB), diferenças entre local.settings.json e variáveis de staging/prod | Tech Lead | Nova integração externa adicionada | "adicione variável de ambiente para X", "configure a conexão com Y", "como acessar Z da config" | Dev Backend · Tech Lead · Claude Code ao configurar novas integrações | Baixa — apenas ao adicionar novas integrações externas |

---

## 02 · Domain

**Propósito:** Padrões por camada técnica — como cada módulo é estruturado internamente.  
**Owner primário:** Senior Dev responsável pela camada  
**Frequência de mudança:** Média — quando 2+ instâncias divergem do padrão documentado.

| Skill | Arquivo | O que define | Owner | Gatilho de atualização | Frase-ativação | Quem consome | Frequência de uso |
|---|---|---|---|---|---|---|---|
| `azure-functions-endpoint` | `skills/domain/azure-functions-endpoint.md` | Estrutura padrão de HTTP trigger: injeção de dependências no topo, validação Zod antes do handler, response contract (status + body + headers), como chamar src/services/ sem lógica de negócio no handler | Senior Dev Backend | 2ª Function com estrutura diferente | "crie um endpoint HTTP", "adicione uma Azure Function", "preciso de uma nova rota" | Dev Backend · Claude Code ao executar `create-rag-endpoint` | Alta — um por endpoint criado no projeto |
| `azure-ai-search-integration` | `skills/domain/azure-ai-search-integration.md` | Setup do SearchClient, construção de queries com vector + semantic reranking, mapeamento de SearchResult para o tipo Chunk interno, tratamento de zero-results, cálculo do score de relevância | Senior Dev Backend | Mudança no schema do índice ou estratégia de busca | "faça uma busca no índice", "consulte o Azure Search", "recupere documentos relevantes" | Dev Backend · Claude Code ao modificar src/services/search.ts | Média — ao criar ou modificar a camada de busca |
| `azure-openai-integration` | `skills/domain/azure-openai-integration.md` | Setup do AzureOpenAI client com retry e timeout, montagem do array de mensagens (system prompt + chunks + user question), parâmetros de completion (temperatura, max_tokens), respostas com e sem streaming | Senior Dev Backend | Troca de modelo ou mudança em parâmetros de completion | "gere uma resposta com o modelo", "faça a completion", "monte o prompt com os chunks" | Dev Backend · Claude Code ao modificar src/services/completion.ts e prompt-builder.ts | Média — ao criar ou modificar a camada de completion |
| `react-components` | `skills/domain/react-components.md` | Estrutura de componente funcional (props interface, lógica no topo, JSX no retorno), quando usar estado local vs contexto global, padrão CSS Modules, convenção de nomenclatura e exports nomeados | Senior Dev Frontend | Componente com estrutura diferente dos existentes | "crie um componente React", "adicione um card no painel", "construa o formulário de X" | Dev Frontend · Claude Code ao executar `create-react-card` | Média — um por componente novo no painel web |
| `teams-adaptive-cards` | `skills/domain/teams-adaptive-cards.md` | Estrutura de Adaptive Card v1.5, padrão do response-card (resposta + citação de fonte + score), padrão do feedback-card (thumbs up/down + comentário), como registrar no bot.ts via sendActivity | Senior Dev Backend | Novo tipo de interação no bot | "crie um card no Teams", "monte a resposta do bot", "adicione um Adaptive Card" | Dev Backend · Claude Code ao executar `create-teams-card` | Baixa — bot tem 2 cards iniciais, cresce pontualmente |
| `testing-patterns` | `skills/domain/testing-patterns.md` | Quando usar unit vs integration vs e2e, uso de fixtures de tests/fixtures/, configuração do msw para mockar Azure AI Search e OpenAI, estrutura de describe/it, convenções de nomenclatura de arquivos de teste | Senior Dev | Novo padrão de mock ou tipo de fixture | "escreva um teste para X", "como mockar Y", "adicione cobertura de integração" | Todos os Devs · Claude Code ao executar `create-integration-test` | Alta — paralela à criação de todo endpoint ou service |
| `sdd-spec` | `skills/domain/sdd-spec.md` | Template SDD com exemplos reais: requirements.md (contexto, funcionais, não-funcionais, critérios de aceite), plan.md (sequência, dependências, riscos), tasks.md (checklist atômico com estimativas), fluxo de aprovação por papel | Tech Lead + Product Specialist | Ajuste no processo de discovery | "escreva os requisitos de X", "crie o requirements.md de Y", "documente o módulo Z" | Tech Lead · Product Specialist · Claude Code ao executar `create-sdd-spec` | Baixa/Média — um por módulo do projeto |

---

## 03 · Artifact

**Propósito:** Receitas de geração específicas — instruções passo a passo para criar um artefato concreto.  
**Owner primário:** Senior Dev cria a primeira versão; qualquer Dev atualiza via PR.  
**Frequência de mudança:** Alta — cada nova instância pode revelar uma lacuna na receita.

| Skill | Arquivo | O que define | Owner | Gatilho de atualização | Frase-ativação | Quem consome | Frequência de uso |
|---|---|---|---|---|---|---|---|
| `create-rag-endpoint` | `skills/artifact/create-rag-endpoint.md` | Recipe completo para novo Azure Function com padrão RAG: validação Zod → search.ts → prompt-builder.ts → completion.ts → response-builder.ts. Inclui error handling por etapa, logging de latência e resposta com citação obrigatória de fonte | Senior Dev Backend | Cada novo endpoint RAG criado | "crie um novo endpoint RAG", "implemente a rota de consulta de X", "preciso de um endpoint que busca e responde com IA" | Dev Backend · Claude Code (principal receita de implementação do projeto) | Alta — artefato central do projeto, acionada múltiplas vezes |
| `create-integration-test` | `skills/artifact/create-integration-test.md` | Recipe para teste de integração: setup msw com handlers para Azure AI Search e OpenAI, import de fixtures de tests/fixtures/, padrão arrange/act/assert, assertions de status, body e sourceDocument, teardown correto dos handlers | Senior Dev | Novo endpoint ou serviço criado | "escreva testes de integração para o endpoint X", "adicione cobertura de integração com mocks" | Todos os Devs · Claude Code | Alta — paralela a cada `create-rag-endpoint` |
| `create-react-card` | `skills/artifact/create-react-card.md` | Recipe para novo card component: estrutura de arquivos (Card.tsx + Card.module.css + Card.test.tsx), props interface com estados (loading/success/error/empty), acessibilidade (role, aria-label, aria-live), integração no layout do painel | Senior Dev Frontend | Novo componente de resultado ou feedback | "crie o card de resposta", "adicione o componente de feedback", "novo card de resultado no painel" | Dev Frontend · Claude Code | Baixa/Média — painel web tem poucos tipos de card distintos |
| `create-adr` | `skills/artifact/create-adr.md` | Recipe para novo ADR: nomenclatura NNNN-titulo-da-decisao.md, seções obrigatórias (Contexto, Decisão, Consequências, Alternativas Consideradas), onde salvar em docs/adr/, como referenciar outros ADRs e specs | Tech Lead | Decisão arquitetural significativa tomada | "registre a decisão de X", "documente a escolha arquitetural de Y", "crie um ADR para Z" | Tech Lead · Claude Code | Baixa — estimativa: 5–10 ADRs no projeto total |
| `create-sdd-spec` | `skills/artifact/create-sdd-spec.md` | Recipe para spec de novo módulo: criar pasta em specs/{modulo}/, preencher requirements.md (com contexto do cenário NovaTech), plan.md (sequência de tasks e dependências técnicas), tasks.md (checklist atômico aprovado pelo Tech Lead) | Tech Lead + Product Specialist | Novo módulo ou feature aprovado | "crie os artefatos SDD do módulo X", "escreva o requirements e plan de Y" | Tech Lead · Product Specialist · Claude Code | Baixa — 5 módulos definidos (pipeline-ingestao, query-endpoint, feedback-api, teams-bot, painel-web) |
| `create-pipeline-stage` | `skills/artifact/create-pipeline-stage.md` | Recipe para novo estágio do pipeline de ingestão: interface PipelineStage com método process(input, context), logging de chunks processados/rejeitados, como encadear na sequência extractor → chunker → embedder → indexer, teste unitário do estágio | Senior Dev Backend | Novo formato de documento ou etapa de pré-processamento | "adicione um estágio ao pipeline de ingestão", "implemente o processador de X", "crie a etapa de pré-processamento de Y" | Dev Backend · Claude Code | Baixa — 4 estágios iniciais, cresce conforme novos formatos de documento |
| `create-teams-card` | `skills/artifact/create-teams-card.md` | Recipe para novo Adaptive Card no bot: estrutura JSON do card (type, version, body, actions), criar em src/bot/cards/, chamar via sendActivity(turnContext, { attachments: [card] }), simular no Bot Framework Emulator local | Senior Dev Backend | Nova interação do bot com o usuário | "adicione um novo card no bot do Teams", "implemente a interação de X", "crie o Adaptive Card de Y" | Dev Backend · Claude Code | Baixa — 2 cards iniciais (response-card, feedback-card), cresce conforme necessidade |

---

## Governança

### Quem cria e quem mantém

| Camada | Quem cria | Quem revisa | Impacto de mudança |
|---|---|---|---|
| Foundation | Tech Lead | Senior Devs (todos) | Alto — toda camada é afetada. PR de mudança deve incluir update em todas Domain/Artifact afetadas |
| Domain | Senior Dev da camada | Tech Lead | Médio — afeta todos os Artifacts daquela camada. Devs usam a Domain como contrato |
| Artifact | Senior Dev (1ª versão) | Qualquer Dev via PR | Baixo — afeta apenas novos artefatos daquele tipo. Instâncias existentes não precisam ser retro-aplicadas |

### Gatilhos de atualização

**Foundation**
- Adoção de nova versão do TypeScript com mudança de convenção
- Mudança na estratégia global de logging ou observabilidade
- Nova integração externa que exige variável de config global
- Refactor de nomenclatura aprovado pelo time em retrospectiva

**Domain**
- Segunda implementação de uma camada com estrutura diferente da documentada
- Mudança no schema do índice Azure AI Search ou troca de modelo OpenAI
- Novo padrão de teste adotado (ex: substituição de mock por fixture real)
- Adição de campo obrigatório no Adaptive Card ou no response contract
- Dev pergunta "como funciona X?" — se não está na skill, ela precisa ser atualizada

**Artifact**
- Cada novo artefato criado que seguiu a receita mas precisou de passos extras
- PR que adiciona etapa ao fluxo RAG (ex: cache layer, reranking adicional)
- Novo tipo de fixture ou helper de teste criado e reutilizável
- Dev pergunta "como faço X?" — a resposta dada vira update na skill do mesmo PR

---

## Regra de ouro

> Qualquer PR que crie um artefato novo e precise de passos não cobertos pela Artifact skill correspondente **deve atualizar a skill no mesmo PR** — nunca num ticket futuro.

Skills são código: versionadas no Git, revisadas via PR, com o mesmo rigor que o código-fonte.
