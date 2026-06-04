# Análise Técnica — Assistente de IA NovaTech
**Consultor:** DB1 Group — Engenharia de Software  
**Data:** Junho/2026  
**Versão:** 3.0  
**Classificação:** Interno / Confidencial  
**Histórico:** v1.0 (emissão inicial) → v2.0 (revisão técnica interna — incorporação de pontos críticos) → v3.0 (segunda revisão técnica interna — custo AI Search, ground truth, conhecimento tácito e demais pontos remanescentes)

---

## Sumário Executivo

A NovaTech possui uma base documental distribuída e heterogênea que torna inviável qualquer abordagem de busca textual tradicional. Este documento analisa os desafios técnicos específicos de cada fonte de dados para a construção de um pipeline de RAG (*Retrieval-Augmented Generation*), estima o volume total da base em tokens, dimensiona o orçamento de contexto por query e recomenda uma estratégia de chunking adequada ao perfil de uso do sistema.

**A conclusão central é que o projeto é tecnicamente viável dentro do prazo de 3 meses, porém com margem reduzida para imprevistos.** A viabilidade do cronograma está diretamente condicionada à resolução antecipada de três dependências externas que estão fora do controle da consultoria: (1) provisionamento e aprovação dos serviços Azure pela TI da NovaTech, (2) liberação de acessos às três fontes de dados, e (3) definição de um processo de governança documental pela NovaTech antes do início do desenvolvimento. Qualquer atraso nessas frentes compromete o go-live no prazo.

Além das questões técnicas de ingestão — OCR, tabelas e chunking —, esta versão incorpora riscos de governança, segurança, conformidade com a LGPD e adoção pelos usuários que são determinantes para o sucesso operacional do produto.

**Risco estrutural de destaque (v3.0):** parte do conhecimento operacional da NovaTech não está registrada nos documentos — está nas pessoas. A equipe de atendimento já resolve ambiguidades "perguntando para quem sabe", o que indica a existência de conhecimento tácito que o assistente não conseguirá recuperar. Um RAG indexa apenas o que está escrito; regras não documentadas serão respondidas com confiança incorreta ou simplesmente ausentes. O mapeamento desse conhecimento tácito é uma atividade de discovery crítica que deve ocorrer antes da indexação.

---

## 1. Análise por Tipo de Fonte

### 1.1 PDFs com Tabelas Complexas (15+ colunas)

**Natureza do desafio para o pipeline de RAG**

Tabelas de frete com 15 ou mais colunas representam o caso mais crítico de extração. Bibliotecas padrão como `pdfplumber` e `PyMuPDF` extraem o conteúdo celular, mas perdem a relação entre cabeçalho e linha quando a tabela é fragmentada em múltiplas páginas ou quando o PDF foi gerado a partir de scan. O resultado típico é uma sequência de valores numéricos sem contexto semântico — por exemplo, `"Sul | 72h | 96h | 120h"` sem que o chunk contenha a informação de qual coluna corresponde a qual tipo de cliente ou modalidade de entrega.

**Impacto na qualidade das respostas**

Um chunk parcial de tabela gera respostas com alta probabilidade de alucinação ou incompletude. O modelo pode inferir relações incorretas entre colunas, especialmente quando os cabeçalhos foram capturados num chunk anterior ao recuperado. Esse é o tipo de erro mais perigoso no contexto de atendimento: uma resposta sobre prazo de entrega ou valor de frete que parece correta mas está fundamentada em associação errônea de colunas.

**Estratégia de tratamento**

1. **Extração estruturada via Azure AI Document Intelligence** (modelo `prebuilt-layout`): identifica células, headers e relacionamentos de tabela com precisão superior a bibliotecas genéricas. O custo por página processada deve ser contabilizado no orçamento de ingestão (ver Seção 2.2).
2. **Serialização semântica da tabela:** cada linha da tabela deve ser convertida em texto estruturado que inclua explicitamente os cabeçalhos. Exemplo: `"Tipo de cliente: Premium | Região: Sul | Prazo padrão: 72h | Prazo expresso: 24h | Taxa de urgência: R$ 45,00"`. Isso garante que cada chunk de tabela seja semanticamente autocontido.
3. **Metadados de proveniência:** cada chunk deve carregar metadados como `fonte`, `nome_documento`, `versão`, `data_atualização`, `tipo=tabela` para permitir filtragem no retrieval.
4. **Não chunkar linhas de tabela individualmente:** agrupar blocos de 5–10 linhas relacionadas com cabeçalho repetido no início de cada chunk.

---

### 1.2 PDFs Escaneados (OCR Necessário)

**Natureza do desafio para o pipeline de RAG**

Documentos escaneados são, do ponto de vista do pipeline, imagens — não texto. Sem uma etapa de OCR, esses arquivos são completamente invisíveis ao índice vetorial. Além disso, dois sub-problemas se somam: (a) **fluxogramas e diagramas embutidos como imagens** não produzem texto nem com OCR convencional; (b) a **qualidade do scan** (DPI, inclinação, ruído) determina diretamente a acurácia do OCR e, consequentemente, a qualidade dos embeddings gerados.

**Impacto na qualidade das respostas**

OCR com baixa acurácia produz tokens corrompidos (`"prazo máxirno"` em vez de `"prazo máximo"`) que degradam a qualidade dos embeddings semânticos. Documentos com fluxogramas de procedimento — como o fluxo de uma reclamação de carga danificada — simplesmente não terão esse conteúdo indexado, gerando respostas incompletas para perguntas sobre procedimentos operacionais.

**Estratégia de tratamento**

1. **Azure AI Document Intelligence com OCR de alta fidelidade** como etapa obrigatória de pré-processamento para todos os PDFs — não apenas os escaneados. O serviço identifica automaticamente se um PDF é nativo ou escaneado.
2. **Pós-processamento do texto OCR:** normalização de caracteres corrompidos, remoção de artefatos de layout (números de página, cabeçalhos repetidos, marcas d'água).
3. **Fluxogramas e imagens funcionais:** adotar uma estratégia de *captioning* multimodal. O Azure AI Vision (ou GPT-4o Vision) pode gerar descrições textuais dos fluxogramas, que são então indexadas como chunks com metadado `tipo=imagem_descrita`. Exemplo de output: `"Fluxograma: Procedimento de reclamação de carga. Etapas: (1) Cliente aciona atendimento → (2) Atendente abre ticket no sistema → (3) Inspeção de carga em até 48h → ..."`. **Atenção — custo e qualidade:** a quantidade de fluxogramas na base deve ser levantada na auditoria do Mês 1. Manuais de procedimento operacional podem conter fluxogramas em cada seção, o que tornaria o custo de captioning relevante. Além disso, fluxogramas complexos (15+ etapas, decisões condicionais) podem não ser descritos com fidelidade suficiente pelo modelo de visão, especialmente se o scan for de baixa resolução. **Obrigatório:** incluir revisão humana de ao menos 10–15% das descrições geradas (priorizando fluxogramas de alta criticidade operacional) antes da indexação. Uma descrição incorreta de um fluxo de reclamação indexada como verdade pode gerar respostas sistematicamente erradas para toda uma categoria de perguntas.
4. **Auditoria de cobertura:** ao final da ingestão, gerar relatório de documentos com acurácia de OCR abaixo de 85% para revisão manual prioritária.

---

### 1.3 Wiki Confluence (Links Internos + Macros Customizadas)

**Natureza do desafio para o pipeline de RAG**

A wiki apresenta dois problemas estruturais distintos. O primeiro é de **dependência contextual entre páginas**: links internos do tipo `"ver também: Política de Devolução para Clientes Premium"` criam referências implícitas que o RAG não resolverá automaticamente — o chunk recuperado pode estar incompleto sem o conteúdo linkado. O segundo é de **ruído de extração**: macros customizadas do Confluence (painéis de aviso, blocos de código, tabelas de status, abas dinâmicas) geram HTML não-padrão que, quando extraído via API, produz artefatos como `{panel:title=Atenção}`, tags HTML residuais e blocos de metadado que poluem o texto indexado.

**Atenção adicional — Tipo de instância Confluence:** a estratégia de extração via REST API difere entre instâncias Cloud e Server/Data Center. Na versão Cloud, o endpoint `/wiki/api/v2/pages/{id}` é o recomendado; em Server/DC, é `/rest/api/content/{id}`. Tokens de acesso têm validade e rotação diferente entre versões. O tipo de instância deve ser confirmado com a TI da NovaTech antes do início do pipeline.

**Impacto na qualidade das respostas**

Links não resolvidos resultam em chunks com informação incompleta, gerando respostas parciais para perguntas que dependem de múltiplas páginas relacionadas. O ruído de macros degrada os embeddings: tokens como `{color:#FF0000}` ou `<ac:structured-macro>` não têm valor semântico e distorcem o espaço vetorial, reduzindo a precisão do retrieval.

**Estratégia de tratamento**

1. **Extração via Confluence REST API** com parsing do formato `storage` (XML nativo do Confluence), que é mais estruturado que o HTML renderizado. Confirmar tipo de instância (Cloud vs. Server/DC) antes da implementação.
2. **Pipeline de limpeza de macros:** regex + parser XML para remover ou converter macros para texto limpo. Macros de aviso (`{warning}`, `{note}`) devem ser preservadas como texto prefixado: `"[ATENÇÃO]: ..."`.
3. **Resolução de links internos por grafo:** construir um grafo de dependências entre páginas antes do chunking. Páginas fortemente linkadas entre si devem ter seus chunks enriquecidos com resumo das páginas referenciadas como metadado (`contexto_relacionado`). Para páginas com 3+ links de entrada (hubs), considerar indexação com chunk maior ou duplicação de contexto.
4. **Sincronização incremental:** a API do Confluence expõe `lastModified` por página, permitindo reindexar apenas páginas alteradas na atualização mensal — reduzindo o custo operacional do pipeline.

---

### 1.4 Planilhas com Fórmulas Interdependentes

**Natureza do desafio para o pipeline de RAG**

Planilhas são estruturas bidimensionais com semântica dependente de posição (cabeçalhos em linha 1, dados a partir da linha 2) e fórmulas que referenciam outras células e às vezes outras planilhas. Para o RAG, fórmulas são inúteis — o que importa são os **valores calculados** e o **contexto semântico da coluna**. Adicionalmente, planilhas atualizadas mensalmente por áreas diferentes podem ter schemas inconsistentes entre versões. A pasta de rede pode não ter um endpoint API acessível diretamente de ambientes Azure — o método de acesso (UNC path, drive mapeado, ou migração para SharePoint) deve ser confirmado na fase de discovery.

**Impacto na qualidade das respostas**

Indexar fórmulas brutas gera chunks semanticamente vazios. A ausência de cabeçalhos nos chunks torna impossível ao modelo interpretar o significado de valores numéricos. Versões desatualizadas da planilha ainda indexadas podem retornar valores incorretos para perguntas sobre tarifas e SLAs.

**Estratégia de tratamento**

1. **Avaliação das fórmulas antes da extração — com cautela:** a opção `data_only=True` do `openpyxl` lê o cache de valores calculados armazenado no arquivo. Contudo, esse cache **não é atualizado** se a planilha foi salva sem recalcular (ex: salva pelo `openpyxl` em uma etapa anterior, o que apaga o cache), resultando em `None` silencioso para todas as células com fórmula — sem erro, sem aviso. **Estratégia robusta recomendada:** forçar o recálculo antes da extração usando LibreOffice em modo headless (`libreoffice --headless --convert-to xlsx`) ou, preferencialmente, adotar como padrão de processo a exportação das planilhas como CSV com valores calculados pelo time responsável, como etapa do processo de atualização mensal. **Atenção — limitações do LibreOffice headless:** (a) adiciona dependência de runtime de ~300MB no ambiente de ingestão, que deve ser prevista na configuração do container/VM; (b) VLOOKUPs e referências cruzadas entre arquivos falham silenciosamente se os arquivos referenciados não estiverem no mesmo diretório no momento do recálculo; (c) fórmulas modernas do Excel 365 (`XLOOKUP`, Power Query, tabelas dinâmicas) podem ter comportamento divergente. **Contingência:** dado que a NovaTech tem licenças M365 E3, avaliar como alternativa primária o uso da **Microsoft Graph API** (`/workbooks/{id}/worksheets/{id}/usedRange`) para leitura de valores calculados diretamente via Excel na nuvem, o que garante compatibilidade nativa com todas as fórmulas. A validação das planilhas mais críticas (frete e SLA) no pipeline LibreOffice deve ser feita na Sprint 1 do Mês 1 antes de finalizar a estratégia de extração.
2. **Serialização estruturada linha-a-linha** com cabeçalho explícito: `"Origem: São Paulo | Destino: Manaus | Peso até 100kg: R$ 380,00 | Peso 100–500kg: R$ 290,00/100kg | ..."`. **Atenção:** essa serialização expande significativamente o volume de tokens por planilha. Uma planilha com 200 linhas e 10 colunas pode gerar 15.000–30.000 palavras após serialização — 5 a 15 vezes a estimativa inicial. Amostrar ao menos 5 planilhas representativas na fase de discovery para calibrar o fator de expansão real antes de fechar estimativas de custo.
3. **Versionamento explícito nos metadados:** todo chunk gerado de planilha deve incluir `data_referência`, `área_responsável` e `versão`. O pipeline de retrieval deve filtrar por `data_referência = mais_recente` por padrão. O processo de deleção de chunks de versões obsoletas do índice deve ser explicitamente implementado na pipeline de atualização (ver Seção 7 — Governança).
4. **Alertas de conflito:** implementar verificação automatizada no pipeline de ingestão que detecte divergência de valores entre versões e sinalize para o processo de governança (ver Seção 7), não apenas para o atendente.

---

## 2. Estimativa do Tamanho da Base em Tokens

A regra prática adotada é: **1 token ≈ 0,75 palavras** (ou ~4 caracteres), conforme padrão dos tokenizadores BPE usados por modelos GPT.

### 2.1 Cálculo por Fonte

| Fonte | Quantidade | Palavras estimadas | Tokens estimados | Observação |
|---|---|---|---|---|
| PDFs (SharePoint) | 800 docs × 10 páginas × 300 palavras/pág | 2.400.000 palavras | **3.200.000 tokens** | Estimativa conservadora; pode variar ±40% |
| Wiki Confluence | 400 páginas × 1.500 palavras/pág | 600.000 palavras | **800.000 tokens** | Antes da limpeza de macros |
| Planilhas (estimativa base) | 50 planilhas × 2.000 palavras | 100.000 palavras | **133.000 tokens** | **Subestimada — ver nota abaixo** |
| **Planilhas (estimativa expandida)** | 50 planilhas × **15.000 palavras** (após serialização) | **750.000 palavras** | **~1.000.000 tokens** | Estimativa com fator de expansão 7,5× |
| **Total (base)** | | ~3.100.000 palavras | **~4.133.000 tokens** | Sem serialização expandida |
| **Total (expandido)** | | ~3.750.000 palavras | **~5.000.000 tokens** | Com serialização expandida de planilhas |

> **Nota crítica sobre planilhas:** a estimativa de 2.000 palavras/planilha pressupõe planilhas simples. Após a serialização semântica linha-a-linha com cabeçalhos repetidos (estratégia definida na Seção 1.4), uma planilha de frete com 200 linhas e 10 colunas pode facilmente gerar 15.000–30.000 palavras. O fator de expansão real deve ser medido com amostras na fase de discovery e pode elevar o volume total das planilhas em 5–15×. Até essa validação, trabalhar com a estimativa expandida como cenário conservador de planejamento.

### 2.2 Interpretação

A base total estimada entre **4,1 e 5 milhões de tokens** representa aproximadamente **32–39 vezes** a janela de contexto máxima do GPT-4o (128K tokens). Isso torna inviável qualquer abordagem de "contexto completo" e confirma que a arquitetura RAG com vector store é o único caminho viável.

**Estimativa de custos de ingestão (únicos):**

| Componente | Volume | Custo estimado |
|---|---|---|
| Azure AI Document Intelligence (PDFs) | 800 docs × 10 pág = 8.000 páginas | ~$12–$16 (tier S0: ~$1,50–$2,00/1.000 pág) |
| Azure OpenAI Embeddings — ingestão total | ~5.000.000 tokens | ~$1,00 (text-embedding-3-large: $0,20/1M tokens) |
| **Total ingestão inicial** | | **~$13–$17** |

**Estimativa de custos operacionais mensais (recorrentes):**

| Componente | Base de cálculo | Custo mensal estimado |
|---|---|---|
| GPT-4o — tokens de input (192 queries/dia × 7.500 tokens × 30 dias) | ~43.200.000 tokens/mês | ~$108/mês ($2,50/1M) |
| GPT-4o — tokens de output (192 queries × ~800 tokens resposta × 30 dias) | ~4.608.000 tokens/mês | ~$46/mês ($10,00/1M) |
| Azure AI Search — SKU Standard S1 (ver nota abaixo) | Fixo | **~$250/mês** |
| Reindexação mensal — embeddings (~5% da base = 250.000 tokens) | 250.000 tokens/mês | < $0,10/mês |
| Azure AI Document Intelligence — reindexação mensal (~40 docs novos estimados) | ~400 páginas | ~$0,60–$0,80/mês |
| **Total operacional mensal estimado** | | **~$404–$425/mês** |

> **Nota crítica sobre Azure AI Search — SKU:** o SKU Basic (~$75/mês) inclui apenas **1.000 consultas semânticas gratuitas por mês**. Com 192 queries/dia × 30 dias = ~5.760 consultas/mês, o limite gratuito seria ultrapassado nos primeiros 5 dias, gerando cobranças adicionais ou degradação do serviço. O **SKU Standard S1 (~$250/mês)** é o adequado para o volume de uso previsto e inclui o Semantic Ranker sem limite de queries. A estimativa original de $75/mês para o AI Search estava subdimensionada em ~3,3×, elevando o total operacional de ~$230–250/mês para ~$404–425/mês. Este valor deve ser formalmente apresentado ao cliente e validado antes do fechamento do contrato.

> **Atenção geral:** esses valores são estimativas para fins de planejamento e devem ser revisados após a fase de discovery, especialmente após calibrar o volume real de tokens das planilhas e a taxa de atualização mensal. Os preços da Azure estão sujeitos a alteração.

---

## 3. Análise de Orçamento de Contexto por Query

### 3.1 Decomposição da Janela de 128K Tokens (GPT-4o)

| Componente | Tokens reservados | Justificativa |
|---|---|---|
| System prompt + instruções de comportamento | ~2.000 | Persona, regras de citação de fonte, formato de resposta, instrução de fallback |
| Histórico de conversa (últimas 3 trocas) | ~1.500 | Contexto de multi-turn para follow-up questions |
| Pergunta atual do usuário | ~200 | Perguntas operacionais tendem a ser curtas |
| Espaço para a resposta gerada | ~2.000 | Respostas com citação de fonte e formatação |
| **Chunks recuperados (disponível)** | **~122.300** | Espaço para contexto documental |

### 3.2 Capacidade Teórica vs. Prática

Com chunks de 500 tokens, o espaço disponível comporta teoricamente **~244 chunks por query**. No entanto, essa capacidade teórica é enganosa por três razões:

**Razão 1 — Lost in the Middle:** Pesquisas empíricas em LLMs (Liu et al., 2023) demonstram que modelos de linguagem degradam sua capacidade de utilizar informação posicionada no meio do contexto. A performance é significativamente melhor para chunks posicionados no início e no final da janela de contexto. Injetar 200+ chunks por query garante que a maioria da informação relevante caia exatamente na "zona morta" do meio.

**Razão 2 — Custo por query:** 122K tokens de contexto a ~$2,50/1M tokens (GPT-4o input) = **$0,31 por chamado**. Com 192 consultas documentais/dia, o custo diário seria de ~$59,50 — proibitivo.

**Razão 3 — Latência acumulada:** o pipeline de retrieval é sequencial (extração de filtros → busca vetorial → reranking → geração de resposta). Janelas de contexto maiores aumentam diretamente o time-to-first-token. Com picos de carga no início de turno (9h–11h), filas no endpoint Azure OpenAI podem elevar a latência p95 significativamente acima da média. **A meta de <2 minutos da diretoria é sobre o tempo total da interação, não sobre o tempo de geração do modelo isolado.**

### 3.3 Orçamento de Contexto Recomendado

| Configuração | Chunks | Tokens de contexto | Custo/query (input) | Latência estimada p50 |
|---|---|---|---|---|
| Mínimo (precisão alta) | 8 chunks | ~4.000 tokens | ~$0,01 | < 3s |
| **Recomendado (balanceado)** | **15 chunks** | **~7.500 tokens** | **~$0,019** | **< 5s** |
| Máximo (recall alto) | 25 chunks | ~12.500 tokens | ~$0,031 | ~7s |

> **SLA de latência:** recomenda-se definir como critério de aceite formal o tempo de resposta p95 ≤ 10 segundos (não apenas p50), medido sob carga real durante os testes do Mês 2. Picos de concorrência devem ser simulados no teste de carga. A meta de <2 minutos da diretoria refere-se ao tempo de busca pelo atendente, não apenas ao tempo de geração — o assistente deve entregar resposta bem dentro desse limite para ser útil.

---

## 4. Estratégia de Chunking Recomendada

### 4.1 Perfil das Perguntas dos Usuários

O atendente da NovaTech fará predominantemente perguntas do tipo:

- **Lookup de regra específica:** *"Qual o prazo máximo para resposta de reclamação de carga avariada para cliente Platinum?"*
- **Cálculo condicional:** *"Como calcular o frete para 800kg de carga refrigerada de São Paulo para Belém?"*
- **Procedimento passo-a-passo:** *"Quais são os passos para processar uma devolução de mercadoria recusada na entrega?"*
- **Verificação de política:** *"O cliente pode solicitar cancelamento de pedido após a coleta?"*

Essas perguntas têm em comum: precisam de **unidades de informação completas e autocontidas**, não de fragmentos de parágrafo. Uma resposta sobre cálculo de frete é inútil se o chunk contém apenas metade da tabela de fatores regionais.

### 4.2 Estratégia Híbrida por Tipo de Documento

Não existe uma estratégia de chunking única ótima para uma base documental heterogênea. Recomendamos uma **abordagem hierárquica com chunking semântico adaptado por tipo**:

#### Documentos Textuais (Manuais, Políticas, Wiki)

**Chunking por seção semântica com overlap de cabeçalho:**

1. Identificar a estrutura hierárquica do documento (Título → Seção → Subseção → Parágrafo) via parsing de headings.
2. Chunk primário = **uma subseção completa** (alvo de 400–600 tokens). Se a subseção exceder 800 tokens, dividir em parágrafos mantendo o cabeçalho da seção repetido no início de cada chunk.
3. **Overlap contextual:** os primeiros 100 tokens de cada chunk devem incluir o breadcrumb hierárquico completo. Exemplo: `[Documento: Manual de Atendimento v2.3 | Seção: Políticas de Devolução | Subseção: Clientes Corporativos]\n\n[conteúdo...]`
4. Tamanho alvo: **500 tokens** com overlap de 50 tokens entre chunks adjacentes da mesma seção.

#### Tabelas (PDF e Planilhas)

**Chunking por grupo de linhas com cabeçalho repetido:**

1. Cada chunk contém o cabeçalho completo da tabela + bloco de 5–10 linhas relacionadas.
2. Tamanho alvo: **300–500 tokens** (tabelas densas têm menos tokens por linha que texto corrido).
3. Para tabelas de frete com dimensionalidade alta (origem × destino × peso × tipo), considerar **pré-computação de lookups frequentes** como chunks especializados.
4. Nunca dividir uma linha de tabela entre dois chunks.

#### Wiki com Dependências de Links

**Chunking por página com enriquecimento de contexto:**

1. Chunk primário = página completa (se < 800 tokens) ou seções da página.
2. Para páginas com links internos resolvidos: adicionar ao chunk um bloco de metadado `contexto_relacionado` com resumo (2–3 frases) das páginas linkadas mais importantes.
3. Páginas identificadas como "hub" (>5 links de entrada) devem ser indexadas com chunk maior (até 1.000 tokens).

### 4.3 Estratégia de Retrieval para Mitigar Lost in the Middle

1. **Reranking com cross-encoder:** após a recuperação dos top-30 chunks por similaridade vetorial, aplicar o Azure AI Search Semantic Ranker para reordenar pelos top-15 mais relevantes.

2. **Posicionamento estratégico no contexto:** os chunks mais relevantes (posições 1–2 do reranker) devem ser posicionados **no início e no final** da janela de contexto, não no meio.

3. **Filtragem por metadados com fallback:** extrair da pergunta do usuário filtros de metadado (tipo de cliente, região, modalidade) quando disponíveis e aplicá-los como filtros pré-retrieval no vector store. **Casos de falha devem ter fallback explícito:** quando a query não fornece informação suficiente para identificar os filtros (ex: "qual o prazo para entrega normal?" sem especificar tipo de cliente), o sistema deve realizar busca sem filtros e retornar os chunks mais relevantes, podendo solicitar ao usuário a informação faltante em linguagem natural antes de responder. O schema de metadados deve ser rigidamente definido e auditado na fase de ingestão para garantir que os filtros sejam aplicáveis.

4. **Cache semântico de queries frequentes:** em um contexto de 192 consultas/dia sobre regras relativamente estáveis, queries idênticas ou semanticamente equivalentes são esperadas (ex: "qual o prazo para o Sul?" sendo feita por múltiplos atendentes). Um cache semântico reduz latência e custo, mas exige: (a) definição de TTL alinhado ao ciclo de atualização mensal da base — respostas em cache devem ser invalidadas quando o documento-fonte for reindexado; (b) estratégia de invalidação por metadado: ao reindexar um documento, todos os registros de cache associados a chunks daquele documento devem ser descartados. Essa lógica deve ser parte do design do pipeline de atualização (ver Seção 7.1).

5. **Detecção de conflito entre chunks com escalonamento definido:** quando dois chunks recuperados apresentarem informações contraditórias (verificação por datas nos metadados + análise semântica no prompt), o modelo deve sinalizar ao atendente com indicação das fontes divergentes. **Importante:** a sinalização ao atendente é uma medida de transparência, não a solução final — o processo de resolução dos conflitos deve ser tratado no processo de governança documental (ver Seção 7), com responsável definido em cada área.

6. **Modo de fallback explícito — "não sei":** quando o assistente não encontrar informação suficiente na base para responder com confiança, deve declarar explicitamente: `"Não encontrei informação sobre isso na documentação disponível. Recomendo consultar [área responsável] ou verificar se o documento correspondente já foi incluído na base."` O sistema nunca deve inferir ou extrapolar respostas além do que está documentado.

---

## 5. Síntese dos Riscos Técnicos e Mitigações

| # | Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|---|
| 1 | OCR de baixa qualidade em scans antigos | Alta | Alto | Azure Doc Intelligence + auditoria de cobertura pós-ingestão |
| 2 | Tabelas fragmentadas gerando respostas incorretas de frete | Alta | Crítico | Serialização semântica linha-a-linha com cabeçalho explícito |
| 3 | Documentos contraditórios gerando respostas inconsistentes | Alta | Alto | Detecção de conflito no retrieval + sinalização ao atendente + processo de governança com responsável definido |
| 4 | Macros Confluence poluindo embeddings | Média | Médio | Pipeline de limpeza via API storage format |
| 5 | `openpyxl data_only=True` retornando `None` silenciosamente | Alta | Alto | Forçar recálculo via LibreOffice headless; avaliar Microsoft Graph API como alternativa primária (M365 E3 disponível) |
| 6 | Volume real de tokens de planilhas 5–15× maior após serialização | Alta | Médio | Amostrar 5 planilhas na fase de discovery; trabalhar com estimativa expandida até confirmação |
| 7 | Latência p95 acima do aceitável sob carga real | Média | Alto | Teste de carga no Mês 2; SLA p95 ≤ 10s como critério de aceite; cache semântico com TTL e invalidação por documento |
| 8 | Self-querying com falha de extração de metadados | Média | Médio | Fallback para busca sem filtros; perguntar ao usuário quando contexto insuficiente |
| 9 | Custo operacional real acima do estimado (SKU AI Search subdimensionado) | **Alta** | **Alto** | Revisar estimativa: Azure AI Search Standard S1 (~$250/mês) necessário para volume de buscas semânticas; total operacional ~$404–425/mês |
| 10 | Atraso no provisionamento de infra Azure e aprovações de TI | Alta | Alto | Sprint dedicada no início do Mês 1; dependência formal registrada no cronograma |
| 11 | Atraso na liberação de acessos às fontes (SharePoint, Confluence, pasta de rede) | Alta | Alto | Pré-requisito formal antes do início do Mês 1; envolver TI da NovaTech desde o kick-off |
| 12 | Qualidade real dos documentos insuficiente para fundamentar respostas | Alta | Alto | Auditoria documental no Mês 1; definir critério mínimo de qualidade documental para indexação |
| 13 | Assistente fornece resposta incorreta usada pelo atendente em decisão operacional | Média | Crítico | Mecanismo de feedback; modo fallback; disclaimer inline em toda resposta positiva; isenção contratual |
| 14 | Baixa adoção pelos 45 atendentes | Média | Alto | Plano de gestão de mudança no Mês 3; piloto com grupo vocal; definição de critérios de escalada para humano |
| 15 | Dados pessoais ou confidenciais indexados sem avaliação LGPD | Média | Alto | Triagem de documentos na fase de discovery; avaliação jurídica da NovaTech antes da indexação |
| 16 | Atendente consulta documentos que não teria acesso no SharePoint original | Média | Médio | Mapeamento de controle de acesso por perfil antes da indexação; avaliar segmentação do índice |
| 17 | Pipeline de atualização mensal sem governança clara | Média | Alto | Processo de governança documental com responsável definido por área (ver Seção 7) |
| 18 | **Conhecimento tácito não documentado: regras operacionais que existem apenas na memória dos atendentes** | **Alta** | **Alto** | Sessões de entrevista com atendentes experientes no Mês 1 para mapear gaps; documentar ou excluir explicitamente do escopo (ver Seção 7.4) |
| 19 | LibreOffice headless com falha silenciosa em VLOOKUPs entre arquivos ou fórmulas Excel modernas | Média | Alto | Testar planilhas críticas na Sprint 1; avaliar Microsoft Graph API como alternativa primária |
| 20 | Ground truth dos 200 pares não entregue pela NovaTech a tempo, bloqueando avaliação do Mês 2 | **Alta** | **Alto** | Formalizar como entregável do cliente com data e responsável; iniciar no kick-off (ver Seção 9.1) |
| 21 | GPT-4o ou `text-embedding-3-large` indisponível na região Brazil South, forçando dados a sair do Brasil | Média | Médio | Verificar disponibilidade de modelos em Brazil South antes de finalizar arquitetura; documentar decisão de residência com aprovação do DPO da NovaTech |
| 22 | Captioning de fluxogramas com baixa fidelidade gerando respostas incorretas sobre procedimentos operacionais | Média | Alto | Revisão humana de 10–15% das descrições geradas; priorizar fluxogramas de alta criticidade operacional |

---

## 6. Stack Tecnológica Recomendada

Considerando o ambiente Microsoft da NovaTech (M365 E3 + Azure AI Services disponíveis):

| Componente | Tecnologia recomendada | Justificativa |
|---|---|---|
| Extração de PDFs | Azure AI Document Intelligence | OCR nativo, detecção de tabelas, integração Azure |
| Extração de Wiki | Confluence REST API + parser XML | Acesso estruturado, suporte a incremental; confirmar versão Cloud vs. Server/DC |
| Extração de Planilhas | Microsoft Graph API (primário) ou LibreOffice headless (fallback) + `openpyxl` | Graph API garante compatibilidade nativa com Excel M365; LibreOffice como contingência |
| Embeddings | Azure OpenAI `text-embedding-3-large` | Alta qualidade, latência baixa, compliance Azure |
| Vector Store | Azure AI Search Standard S1 | SKU necessário para volume de buscas semânticas (>1.000/mês); suporte a hybrid search + Semantic Ranker sem limite de queries |
| LLM | Azure OpenAI GPT-4o | Performance, compliance, dados permanecem no tenant Azure (verificar disponibilidade em Brazil South) |
| Reranker | Azure AI Search Semantic Ranker | Nativo no stack; incluído no SKU Standard S1 |
| Cache semântico | GPTCache ou implementação customizada com Redis | Redução de latência e custo para queries frequentes; TTL alinhado ao ciclo mensal |
| Orquestração | LangChain (Python) | Framework open source consolidado, documentação extensa e maior volume de casos de uso documentados em RAG empresarial. Conectores maduros para todo o stack Azure necessário (`AzureChatOpenAI`, `AzureOpenAIEmbeddings`, `AzureSearch`). Preferível ao Semantic Kernel dado o prazo de 3 meses com margem reduzida e ausência de experiência prévia da equipe com o SK — a curva de aprendizado do SK em produção representa risco desnecessário no cronograma. A integração com o Teams é feita via Azure Bot Service, que é agnóstico ao orquestrador. |
| Interface | Microsoft Teams (bot framework) | Alinhado ao ambiente existente da NovaTech |
| Avaliação de qualidade | RAGAS ou DeepEval | Framework de métricas objetivas (faithfulness, relevância, recall) com critério de aceite numérico |
| Monitoramento pós go-live | Azure Application Insights + dashboard customizado | Rastreamento de latência, taxa de fallback, feedbacks negativos |

---

## 7. Governança Documental — Pré-condição para o Go-Live

Este é um dos itens mais críticos para o sucesso operacional do produto e deve ser tratado como **pré-condição**, não como detalhe de implementação.

### 7.1 Processo de Atualização Mensal

As 3 áreas (Operações, Compliance, Comercial) atualizam documentos em datas diferentes e sem processo unificado de revisão. O pipeline de atualização precisa de definições explícitas antes da construção:

- **Gatilho:** quem dispara a reindexação? Opções: (a) schedule automático no 1º dia útil do mês, (b) webhook configurado no SharePoint/Confluence para acionar ao detectar mudanças, (c) processo manual com responsável designado por área. **Recomendação:** combinar webhook para mudanças no SharePoint/Confluence + schedule mensal para planilhas da pasta de rede.
- **Deleção de chunks obsoletos:** quando um documento é substituído ou removido, os chunks da versão anterior devem ser explicitamente deletados do índice vetorial. O pipeline deve implementar reconciliação: comparar inventário atual das fontes com metadados do índice e remover entradas sem correspondência.
- **Janela de consistência:** durante o processo de reindexação, o índice pode estar parcialmente desatualizado. Definir se reindexações ocorrem incrementalmente (chunk a chunk, sem downtime) ou em lote (índice antigo + novo em paralelo com swap atômico).

### 7.2 Resolução de Conflitos Documentais

A NovaTech já reconhece que documentos se contradizem entre versões. A detecção automatizada pelo assistente sinaliza o problema ao atendente, mas não o resolve. **Antes do go-live, as seguintes definições devem estar formalizadas:**

- Responsável por área (Operações, Compliance, Comercial) designado como **curador documental** para revisar conflitos detectados.
- Prazo de resolução (SLA interno) para que conflitos sinalizados pelo sistema sejam corrigidos na fonte.
- Canal de comunicação entre o sistema (que detecta o conflito) e o curador responsável (ex: ticket automático no sistema de gestão da NovaTech).

### 7.3 Controle de Qualidade Documental na Ingestão

Não todo documento existente merece ser indexado. Na fase de discovery do Mês 1, realizar uma triagem com as seguintes perguntas para cada tipo de documento:

- O documento tem data de criação/revisão identificável? Se não, deve ser descartado ou sinalizado para curadoria humana antes da indexação.
- O documento está vigente ou foi substituído por uma versão mais recente? Documentos obsoletos não devem ser indexados, mesmo que ainda existam nas fontes.
- O conteúdo do documento é suficientemente claro para fundamentar uma resposta ao cliente? Documentos ambíguos ou incompletos devem ser marcados com baixa confiança ou excluídos até revisão.

### 7.4 Mapeamento de Conhecimento Tácito — Risco Estrutural

Este é um dos riscos mais críticos e menos visíveis do projeto. A equipe de atendimento da NovaTech resolve ambiguidades "perguntando para quem sabe" — o que indica que parte do conhecimento operacional **não está nos documentos, está nas pessoas**. Um RAG indexa apenas o que está escrito. Se um manual diz "prazo de 48h para clientes Premium" mas há uma exceção conhecida por todos para clientes Premium de uma região específica que nunca foi documentada, o assistente vai responder "48h" com confiança total para todos os casos — incluindo os em que a exceção se aplica.

Esse risco não tem solução técnica. A única mitigação é de processo, e deve ocorrer **antes** da indexação:

**Ação obrigatória no Mês 1:** realizar ao menos 2–3 sessões de entrevista estruturada com atendentes experientes (preferencialmente os que são consultados com mais frequência pelos colegas) para mapear explicitamente:
- Situações em que a resposta correta vai além do que está escrito no documento.
- Exceções, regras de bolso ou práticas informais consolidadas que nunca foram formalizadas.
- Categorias de perguntas que os atendentes consideram "complicadas" ou que frequentemente geram dúvida.

**Para cada gap identificado, uma decisão deve ser tomada:**
1. **Documentar antes de indexar:** se a regra tácita é válida e estável, a área responsável deve formalizá-la em documento antes que o assistente seja treinado naquele tópico.
2. **Excluir do escopo do assistente:** se a regra é complexa demais para ser documentada ou varia caso a caso, o assistente deve ser configurado para redirecionar esse tipo de pergunta para um humano — explicitamente, não silenciosamente.
3. **Marcar como "consultar supervisor":** respostas sobre tópicos com gaps conhecidos devem incluir aviso explícito de que a resposta é baseada na documentação formal, mas que casos excepcionais devem ser validados com a área responsável.

---

## 8. Segurança, LGPD e Controle de Acesso

### 8.1 Conformidade com a LGPD

O índice vetorial vai processar e armazenar conteúdo da documentação corporativa da NovaTech. Antes da fase de ingestão, as seguintes verificações são necessárias:

- **Triagem de dados pessoais:** verificar se contratos de SLA nominais, documentos de compliance ou planilhas contêm CPFs, dados de clientes identificáveis ou outras categorias de dados pessoais sob proteção da LGPD. Caso existam, esses dados devem ser anonimizados antes da indexação ou os documentos devem ser excluídos do escopo.
- **Aprovação formal da NovaTech:** a indexação de documentação confidencial no Azure AI Search deve ter aprovação explícita do responsável legal/DPO da NovaTech, documentada antes do início da ingestão.
- **Residência dos dados:** confirmar que todos os recursos Azure estão provisionados na região Brazil South ou East US 2, conforme política de dados da NovaTech. **Atenção:** a região Brazil South historicamente tem disponibilidade limitada de modelos Azure OpenAI. Antes de finalizar a arquitetura, verificar explicitamente se GPT-4o e `text-embedding-3-large` estão disponíveis em Brazil South no momento do provisionamento. Se o modelo precisar ser provisionado em East US 2 ou outra região fora do Brasil, os dados dos prompts processados (incluindo conteúdo dos chunks) sairão do território nacional — o que pode ser um problema de conformidade dependendo da política interna da NovaTech. Essa decisão deve ser documentada e aprovada pelo DPO/responsável jurídico da NovaTech antes do início da implementação.

### 8.2 Controle de Acesso ao Assistente

O modelo atual prevê que qualquer atendente com acesso ao Teams poderá consultar qualquer documento indexado, independentemente de ter acesso ao documento original no SharePoint. Isso pode violar políticas de acesso existentes se houver documentos com restrição por nível hierárquico (ex: tabelas de margem, contratos confidenciais).

**Recomendações:**

- Mapear antes da indexação quais documentos têm restrições de acesso nas fontes originais.
- Avaliar se o escopo de indexação deve ser restrito a documentos de acesso irrestrito dentro da empresa, ou se é necessário implementar controle de acesso granular no índice (Azure AI Search suporta filtros por campo de segurança).
- Documentar formalmente o escopo de acesso aprovado pela NovaTech como requisito do sistema.

---

## 9. Avaliação de Qualidade do RAG — Metodologia

A avaliação de qualidade é uma entrega de primeira ordem, não uma etapa opcional. Os critérios devem ser definidos **antes** do início do Mês 2.

### 9.1 Conjunto de Avaliação

- **Volume mínimo:** 200 pares pergunta/resposta esperada (não 50). Esse conjunto deve cobrir os principais tipos de pergunta (lookup, cálculo, procedimento, verificação de política) e casos extremos (pergunta ambígua, pergunta sobre documento inexistente, pergunta com conflito de fontes).
- **Casos negativos obrigatórios:** ao menos 15–20% dos pares devem ser perguntas para as quais **não existe resposta na documentação disponível**. Esses casos validam que o modo "não sei" funciona corretamente e que o assistente não inventa respostas para tópicos fora do escopo.
- **Construção do ground truth — responsável e esforço:** os pares devem ser construídos com participação ativa de especialistas da NovaTech (supervisores de atendimento, representantes das 3 áreas documentais). **Este é um comprometimento significativo do lado do cliente:** 200 pares de qualidade, revisados e validados, geralmente demandam 2–4 semanas de trabalho de 2–3 pessoas em regime de tempo parcial. Esse esforço deve ser **formalizado como entregável do cliente**, com nome do responsável designado, data de início (kick-off) e data de entrega (início do Mês 2). Se a NovaTech não entregar o ground truth a tempo, a etapa de avaliação do Mês 2 não poderá ser executada com critérios objetivos — o que bloqueia a decisão de go-live.
- **Cobertura:** garantir que pelo menos 20% das perguntas do conjunto de avaliação cubram os casos de tabelas complexas e planilhas de frete — os cenários de maior risco de erro.
- **Plano de contingência para atraso:** se o ground truth não estiver completo no início do Mês 2, definir antecipadamente o critério alternativo de aceite (ex: avaliação com conjunto parcial de 100 pares + revisão manual por amostragem), para que o cronograma não fique bloqueado aguardando o cliente.

### 9.2 Métricas Objetivas

Adotar o framework **RAGAS** (ou equivalente como DeepEval) para medição automatizável das seguintes métricas:

| Métrica | Definição | Meta mínima para go-live |
|---|---|---|
| Faithfulness | Proporção das afirmações da resposta que podem ser verificadas nos chunks recuperados | ≥ 0,85 |
| Answer Relevancy | Quão diretamente a resposta endereça a pergunta feita | ≥ 0,80 |
| Context Recall | Proporção das informações necessárias que foram recuperadas | ≥ 0,75 |
| Hallucination Rate | Taxa de afirmações sem suporte nos documentos | ≤ 0,10 |

> Os valores acima são referências de partida; os critérios finais devem ser acordados com a NovaTech antes do início do Mês 2.

### 9.3 Mecanismo de Feedback Pós Go-Live

O assistente deve incluir, desde o go-live, um mecanismo de feedback inline:

- **Disclaimer inline em toda resposta positiva:** cada resposta do assistente — não apenas o modo "não sei" — deve exibir um aviso padronizado abaixo do conteúdo. Texto sugerido (a ser validado com a NovaTech antes dos testes do piloto): *"Esta resposta é baseada na documentação oficial disponível em [data da última atualização]. Em caso de dúvida, valor financeiro relevante ou situação não contemplada, confirme com a área responsável antes de repassar ao cliente."* Esse disclaimer é a contrapartida de design do sistema para a isenção de responsabilidade contratual — não pode ser apenas cláusula contratual, precisa estar visível ao atendente no momento de uso.
- **Botão "Resposta incorreta"** disponível em cada resposta, com campo opcional para comentário do atendente.
- Todos os feedbacks negativos devem ser registrados em log estruturado e revisados semanalmente no primeiro mês, quinzenalmente a partir do segundo.
- Feedback negativo associado a um chunk específico deve disparar revisão do documento-fonte correspondente no processo de governança (ver Seção 7).
- **Dashboard de qualidade** com métricas de taxa de feedback negativo, taxa de fallback ("não sei"), e latência p50/p95 — acessível para a equipe da DB1 e para o gestor responsável na NovaTech.

---

## 10. Gestão de Mudança e Adoção pelos Usuários

Um assistente tecnicamente correto que não é adotado pelos usuários não reduz o tempo de atendimento. O plano de adoção deve ser tratado com o mesmo rigor que o desenvolvimento técnico.

- **Piloto estruturado:** selecionar 8–10 atendentes com perfis variados (não apenas os mais receptivos a tecnologia) para o piloto do Mês 3. Incluir atendentes céticos ou resistentes — o feedback deles é o mais valioso para ajustes.
- **Treinamento com foco no uso correto:** além de ensinar a usar a ferramenta, treinar os atendentes sobre **quando não confiar na resposta** — critérios claros de quando escalar para um supervisor ou verificar diretamente na fonte (ex: quando o assistente sinaliza conflito de informações, quando a resposta é sobre valor financeiro acima de determinado threshold).
- **Critério de escalada para humano:** definir e documentar, como parte do design do sistema, as situações em que o atendente deve obrigatoriamente validar a resposta do assistente antes de repassar ao cliente.
- **Comunicação de expectativas:** deixar claro para os atendentes que erros são esperados e que o mecanismo de feedback é a forma de corrigir a base. Reduzir a pressão sobre a perfeição inicial do sistema.

---

## 11. Roadmap Revisado — 3 Meses

> **Premissa crítica:** as atividades marcadas com **[DEP]** são dependências externas da NovaTech que precisam estar resolvidas antes ou em paralelo com as atividades da DB1. Qualquer atraso nessas dependências impacta diretamente o cronograma.

### Mês 1 — Discovery, Infraestrutura e Pipeline de Ingestão

**Semana 1–2 (em paralelo com NovaTech):**
- **[DEP]** Provisionamento dos serviços Azure: Document Intelligence, AI Search (SKU Standard S1), Azure OpenAI — requer aprovação da TI da NovaTech. Iniciar processo no dia do kick-off. **Verificar disponibilidade de GPT-4o e text-embedding-3-large em Brazil South antes de finalizar região.**
- **[DEP]** Liberação de acessos: service principal com leitura no SharePoint, token de API do Confluence (confirmar versão Cloud vs. Server/DC), método de acesso à pasta de rede.
- **[DEP]** Início da construção do conjunto de avaliação com especialistas da NovaTech (200 pares pergunta/resposta, incluindo ~15–20% de casos negativos) — entregável formal do cliente com responsável designado e prazo definido para o início do Mês 2.
- **[DEP]** Sessões de mapeamento de conhecimento tácito: 2–3 entrevistas com atendentes experientes para identificar regras operacionais não documentadas. Resultado: lista de gaps documentais com decisão para cada item (documentar, excluir do escopo, ou marcar como "consultar supervisor").
- Auditoria e catalogação das 3 fontes: amostrar 50 documentos de cada tipo para calibrar estimativas de tokens, fator de expansão de planilhas, contagem de fluxogramas e identificar documentos obsoletos ou sem metadados.

**Semana 3–4:**
- Validação do pipeline de extração de planilhas: testar Microsoft Graph API e LibreOffice headless com as 5 planilhas mais complexas (tabelas de frete e SLA); confirmar qual abordagem garante valores calculados corretamente antes de finalizar a estratégia.
- Implementação do pipeline de extração para PDFs (Azure Doc Intelligence), Wiki (Confluence API) e Planilhas (abordagem confirmada na semana anterior).
- Validação da qualidade do OCR; auditoria de documentos com acurácia < 85%; contagem e avaliação de complexidade dos fluxogramas para captioning.
- Triagem de documentos para conformidade LGPD; aprovação formal da NovaTech (DPO/responsável jurídico) para indexação, com decisão documentada sobre residência de dados.
- Definição do schema de metadados, estratégia de versionamento e processo de deleção de chunks obsoletos.
- Definição do processo de governança documental com responsáveis por área designados (curadores documentais).

### Mês 2 — RAG Core, Integração e Avaliação

**Semana 5–6:**
- Implementação do chunking por tipo de documento.
- Indexação completa da base no Azure AI Search (Standard S1).
- Desenvolvimento do assistente: retrieval, reranking, self-querying com fallback, modo "não sei", detecção de conflito, cache semântico com TTL/invalidação — orquestrado via LangChain.
- Definição e implementação do **disclaimer inline** em alinhamento com a NovaTech (ver Seção 9.3); validar texto antes dos testes com piloto.

**Semana 7–8:**
- Avaliação de qualidade com conjunto de 200 pares (RAGAS); validação das metas de Faithfulness, Relevancy, Recall e Hallucination Rate. **Se o ground truth da NovaTech não estiver completo, executar com plano de contingência (conjunto parcial + revisão manual amostral) e registrar formalmente o desvio.**
- Ajuste iterativo de parâmetros (número de chunks, threshold de similaridade, prompt engineering) — reservar ao menos 10 dias para essa etapa.
- Teste de carga: simular picos de concorrência (ex: 30 requisições simultâneas) e medir latência p50/p95. Ajustar configuração se p95 > 10s.

### Mês 3 — Integração Teams, Piloto e Go-Live

**Semana 9–10:**
- Integração com Microsoft Teams (Bot Framework): autenticação SSO com Azure AD, permissões de tenant, publicação no canal. **[DEP]** Requer aprovação e suporte da TI da NovaTech para publicação do bot.
- Implementação do pipeline de atualização mensal automatizado (webhooks + schedule + deleção de obsoletos).
- Implementação do mecanismo de feedback (botão "resposta incorreta") e dashboard de monitoramento.

**Semana 11–12:**
- Testes de aceitação com grupo piloto de 8–10 atendentes (perfis variados).
- Treinamento da equipe completa: uso correto, critérios de confiança e escalada.
- Ajustes finais com base no feedback do piloto.
- Go-live gradual: 100% dos atendentes, com monitoramento intensivo na primeira semana.

---

*Documento gerado por DB1 Group — Engenharia de Software — v3.0. Incorpora segunda revisão técnica interna de junho/2026. Estimativas de custo e volume devem ser revisadas após a fase de discovery do Mês 1 com dados reais da base documental da NovaTech. Custo operacional mensal revisado para ~$404–425/mês (SKU Azure AI Search Standard S1 e tokens de output incluídos).*
