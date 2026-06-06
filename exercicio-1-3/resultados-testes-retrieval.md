# Resultados dos Testes de Retrieval — RAG PoC NovaTech

**Data:** 2026-06-06  
**Modelo de embeddings:** `all-MiniLM-L6-v2` (CPU)  
**Vector store:** ChromaDB (modo embedded persistente)  
**Total de chunks indexados:** 42  
**N de chunks recuperados por query:** 5  

---

## Corpus indexado

| Arquivo | Chunks | Prioridade | Tipo de fonte |
|---------|--------|-----------|---------------|
| `POL-001-politica-devolucao.md` | 10 | 1 | SharePoint normativo |
| `PROC-042-frete-especial-v1.md` | 6 | 1 | SharePoint normativo |
| `PROC-042-v2-frete-especial-revisado.md` | 7 | 1 | SharePoint normativo |
| `SLA-2024-tabela-sla-clientes.md` | 8 | 2 | Planilha de referência |
| `FAQ-atendimento.md` | 11 | 3 | Wiki informal |

---

## Resultados por pergunta

### P1 — "Qual o prazo de devolução?"

**Chunks esperados:** POL-001 seção 3.1 e 3.3 (principais), 3.5 (secundário)

| Rank | Documento | Prioridade | Score | Seção |
|------|-----------|-----------|-------|-------|
| 1 | POL-001 | 1 | 0.7336 | 3. Regras de Devolução > **3.5. Custos de devolução** |
| 2 | POL-001 | 1 | 0.8326 | 3. Regras de Devolução > **3.1. Prazo geral** ✓ |
| 3 | POL-001 | 1 | 0.8349 | 3. Regras de Devolução > **3.3. Procedimento de devolução** ✓ |
| 4 | POL-001 | 1 | 0.8522 | 3. Regras de Devolução > **3.3. Procedimento de devolução** ✓ |
| 5 | FAQ-atendimento | 3 | 0.9018 | Item 3 — "Cliente perguntou se pode devolver carga perigosa" |

**Avaliação: ✅ Aprovado**

A seção primária (3.1 Prazo geral) foi recuperada com bom score. As seções 3.3 e 3.5 complementam a resposta com procedimento e custos. O único ruído é o Chunk 5 (FAQ, Item 3), que é temáticamente adjacente (devolução), mas trata de carga perigosa — irrelevante para a pergunta. Por ter prioridade 3, o LLM tende a ignorá-lo corretamente.

---

### P2 — "Posso devolver carga perigosa?"

**Chunks esperados:** POL-001 seção 3.2 (principal), FAQ Item 3 e POL-001 seção 3.1 (secundários)

| Rank | Documento | Prioridade | Score | Seção |
|------|-----------|-----------|-------|-------|
| 1 | FAQ-atendimento | 3 | 0.7985 | **Item 3 — "Cliente perguntou se pode devolver carga perigosa"** ✓ |
| 2 | FAQ-atendimento | 3 | 0.8421 | Item 22 — "Cliente quer saber sobre seguro de carga" |
| 3 | FAQ-atendimento | 3 | 0.9080 | Item 38 — "Cliente quer saber a política para carga danificada" |
| 4 | FAQ-atendimento | 3 | 0.9525 | **Item 32 — "Pode enviar carga perigosa com frete expresso?"** ✓ |
| 5 | POL-001 | 1 | 0.9574 | 3. Regras de Devolução > **3.2. Exceções ao prazo geral** ✓ |

**Avaliação: ⚠️ Parcial**

O chunk oficial mais relevante (POL-001 seção 3.2, que lista a exceção para cargas perigosas) foi recuperado, mas aparece em último lugar (rank 5). O FAQ domina os primeiros 4 resultados — dois deles com ruído (itens 22 e 38, sobre seguro e carga danificada, sem relação direta com devolução de carga perigosa).

O risco prático é que o LLM, ao ler os chunks em ordem, pode dar peso excessivo ao FAQ (prioridade 3) antes de chegar ao POL-001. O system prompt instrui a hierarquia de fontes, mas a posição do chunk na lista pode influenciar o comportamento.

---

### P3 — "Qual o SLA do cliente Gold?"

**Chunks esperados:** SLA-2024 seção 2 — Tabela de SLAs (principal), seção 1 e 3 (secundários)

| Rank | Documento | Prioridade | Score | Seção |
|------|-----------|-----------|-------|-------|
| 1 | SLA-2024 | 2 | 0.9017 | **5. Medição e reportes** |
| 2 | FAQ-atendimento | 3 | 0.9024 | Item 41 — "Qual a diferença entre SLA de resposta e SLA de resolução?" |
| 3 | FAQ-atendimento | 3 | 0.9149 | Item 15 — "Cliente diz que é Platinum. Existe esse tier?" |
| 4 | SLA-2024 | 2 | 0.9555 | **1. Classificação de clientes** |
| 5 | SLA-2024 | 2 | 1.0520 | **1. Classificação de clientes** |

**Avaliação: ❌ Falha de retrieval**

A seção `2. Tabela de SLAs` — que contém os valores concretos de prazo por tier (Gold: resposta 2h / resolução 24h; Silver: 4h / 48h; Standard: 8h / 72h) — **não foi recuperada** nos top-5. O modelo não conectou semanticamente "SLA do cliente Gold" à seção que contém a tabela com esses valores.

Os chunks recuperados incluem a classificação de clientes (critérios de elegibilidade) e medição de reportes, mas não os SLAs em si. Com esse contexto, o LLM não conseguirá responder a pergunta com os valores corretos.

---

### P4 — "Qual o SLA do cliente Platinum?"

**Chunks esperados:** SLA-2024 seção 1 (com declaração "não existem outros tiers"), FAQ Item 15

| Rank | Documento | Prioridade | Score | Seção |
|------|-----------|-----------|-------|-------|
| 1 | FAQ-atendimento | 3 | 0.8085 | **Item 15 — "Cliente diz que é Platinum. Existe esse tier?"** ✓ |
| 2 | SLA-2024 | 2 | 0.9543 | **1. Classificação de clientes** ✓ |
| 3 | SLA-2024 | 2 | 0.9806 | SLA-2024 (introdução do documento) |
| 4 | SLA-2024 | 2 | 0.9859 | **1. Classificação de clientes** ✓ |
| 5 | SLA-2024 | 2 | 0.9965 | 5. Medição e reportes |

**Avaliação: ✅ Aprovado**

Os dois chunks essenciais para uma boa resposta estão presentes: o FAQ Item 15 (que esclarece que Platinum não existe e orienta sobre os tiers reais) e a seção 1 do SLA-2024 (que declara explicitamente "Não existem outros tiers além dos três listados acima"). O LLM tem contexto suficiente para responder corretamente.

---

### P5 — "Frete para 600kg para Manaus?"

**Chunks esperados:** PROC-042-v2 seção 2 (multiplicadores por região, principal), PROC-042-v1 seção 2 (versão antiga — risco de conflito)

| Rank | Documento | Prioridade | Score | Seção |
|------|-----------|-----------|-------|-------|
| 1 | PROC-042-**v1** | 1 | 1.0516 | **1. Objetivo** |
| 2 | PROC-042-v2 | 1 | 1.0690 | **4. Condições especiais** |
| 3 | PROC-042-v2 | 1 | 1.0809 | **1. Objetivo** |
| 4 | PROC-042-v2 | 1 | 1.0864 | **2. Fórmula de cálculo** ✓ |
| 5 | PROC-042-**v1** | 1 | 1.0891 | **2. Fórmula de cálculo** ✓ (versão antiga) |

**Avaliação: ⚠️ Conflito sem resolução automática**

O retrieval funcionou — ambas as versões da PROC-042 foram recuperadas, inclusive as seções de fórmula de cálculo de ambas. O problema está na etapa de geração: v1 e v2 têm a **mesma prioridade de fonte (1)**, portanto a hierarquia do system prompt não consegue desempatar automaticamente.

Os scores são muito próximos (1.05–1.09), e os multiplicadores regionais diferem entre versões (ex.: Região Norte: 1.6 na v1 vs. 1.8 na v2). O LLM precisará usar a data de emissão dos documentos (v1: 03/03/2023; v2: 10/11/2023) como critério de desempate — comportamento que depende do raciocínio do modelo, não de regra explícita no system prompt.

---

## Síntese

| Pergunta | Resultado | Chunks críticos recuperados | Principal problema |
|----------|-----------|---------------------------|-------------------|
| P1 — Prazo de devolução | ✅ Aprovado | POL-001 3.1, 3.3, 3.5 | Ruído mínimo do FAQ |
| P2 — Devolução carga perigosa | ⚠️ Parcial | POL-001 3.2 (rank 5), FAQ Item 3 (rank 1) | Chunk oficial em último; FAQ domina |
| P3 — SLA cliente Gold | ❌ Falha | Seção 2 da tabela de SLAs **ausente** | Retrieval não encontrou os valores concretos |
| P4 — SLA cliente Platinum | ✅ Aprovado | SLA-2024 seção 1, FAQ Item 15 | — |
| P5 — Frete 600kg Manaus | ⚠️ Conflito | PROC-042-v1 e v2 seção 2 (ambas) | Prioridade igual entre versões; desempate depende do LLM |

---

## Recomendações

### 1. Aumentar `n_results` para 7 ou 8 (resolve P2 e P3 parcialmente)
Com 5 chunks, a seção `2. Tabela de SLAs` ficou fora do corte em P3. Aumentar o número de resultados aumenta a probabilidade de incluir chunks relevantes adicionais, ao custo de um prompt maior.

### 2. Adicionar metadado de versão ao `section_path` (mitiga P5)
Incluir a data de emissão ou versão no texto do chunk permite que o LLM identifique explicitamente qual versão é mais recente:
```
"Fonte: PROC-042-v2 (emissão 10/11/2023), seção 2"
```

### 3. Atualizar a hierarquia de fontes no system prompt para PROC-042 (resolve P5)
Adicionar uma regra explícita: *"Para documentos com versões múltiplas sem hierarquia formal, usar sempre a versão com data de emissão mais recente."*

### 4. Reindexar o SLA-2024 com chunking diferente (resolve P3)
A seção `2. Tabela de SLAs` pode estar sendo dividida de forma que o embedding da tabela Markdown pura (sem contexto textual) tenha baixa similaridade com a query. Uma solução é prefixar o chunk da tabela com contexto:
```
"Tabela de SLAs por tier de cliente (Gold, Silver, Standard): ..."
```
