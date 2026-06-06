# RAG PoC — Assistente de Documentação NovaTech

Prova de conceito de um pipeline RAG (Retrieval-Augmented Generation) que ingere a documentação interna da NovaTech, indexa com embeddings semânticos e monta um prompt completo pronto para ser colado no Claude Chat.

## Tecnologias utilizadas

| Ferramenta | Papel |
|---|---|
| `sentence-transformers` (`all-MiniLM-L6-v2`) | Geração de embeddings open-source |
| `ChromaDB` | Vector store local persistente |
| `langchain-chroma` | Integração LangChain + ChromaDB |
| `langchain-text-splitters` | Chunking semântico por headers Markdown |
| Python 3.11+ | Linguagem de implementação |

## Estrutura de arquivos

```
exercicio-1-3/
├── documents/                  # Documentação da NovaTech
│   ├── FAQ-atendimento.md
│   ├── POL-001-politica-devolucao.md
│   ├── PROC-042-frete-especial-v1.md
│   ├── PROC-042-v2-frete-especial-revisado.md
│   └── SLA-2024-tabela-sla-clientes.md
├── chroma_data/                # Criado automaticamente após o ingest
├── ingest.py                   # Fase 1: leitura, chunking e indexação
├── retrieval.py                # Fase 2: busca semântica no vector store
├── prompt_builder.py           # Fase 3: montagem do prompt final
├── main.py                     # CLI unificado
├── requirements.txt
└── README.md
```

## Configuração do ambiente

### 1. Criar e ativar o virtual environment

```bash
# A partir da raiz do projeto
python -m venv ENV
source ENV/bin/activate
```

### 2. Instalar dependências

```bash
pip install -r exercicio-1-3/requirements.txt
```

> O download do modelo `all-MiniLM-L6-v2` (~90MB) ocorre automaticamente na primeira execução do ingest.

## Como usar

Todos os comandos devem ser executados a partir da pasta `exercicio-1-3/` com o venv ativado:

```bash
source ../ENV/bin/activate   # se ainda não ativado
cd exercicio-1-3
```

### Fase 1 — Ingestão (executar uma vez, ou ao atualizar documentos)

Lê os documentos em `documents/`, divide em chunks por seção, gera embeddings e armazena no ChromaDB local.

```bash
python main.py ingest
```

Saída esperada:
```
Carregando modelo de embeddings: all-MiniLM-L6-v2
Coleção 'novatech_docs' existente removida.

  FAQ-atendimento.md: X chunks
  POL-001-politica-devolucao.md: X chunks
  PROC-042-frete-especial-v1.md: X chunks
  PROC-042-v2-frete-especial-revisado.md: X chunks
  SLA-2024-tabela-sla-clientes.md: X chunks

Total: XX chunks armazenados em .../chroma_data
```

### Fase 2 + 3 — Consulta (gera o prompt final)

Recebe uma pergunta, busca os chunks mais relevantes e imprime o prompt completo montado.

```bash
python main.py query "Qual o prazo para devolução de mercadorias?"
```

```bash
python main.py query "Como calcular frete especial para a região Norte?"
```

```bash
python main.py query "Qual o SLA de atendimento para clientes Gold?"
```

A saída inclui:
1. Lista dos top-5 chunks encontrados (documento, prioridade, score de similaridade)
2. O **prompt completo** — system prompt + contexto recuperado + pergunta — pronto para copiar e colar no Claude Chat

### Usando o prompt gerado

Copie o bloco após a linha `PROMPT FINAL (copie e cole no Claude Chat):` e cole diretamente em uma conversa no [Claude.ai](https://claude.ai). O assistente responderá com base exclusivamente na documentação indexada, citando as fontes.

## Estratégia de chunking

Os documentos são divididos por headers Markdown (`##`, `###`), garantindo que cada chunk corresponda a uma seção semântica completa (ex.: "3.1 Prazo geral", "Tabela de SLAs"). Para seções maiores que 600 caracteres, um `RecursiveCharacterTextSplitter` (chunk_size=600, overlap=50) é aplicado como fallback.

Cada chunk armazena os seguintes metadados:

| Metadado | Exemplo |
|---|---|
| `source_file` | `POL-001-politica-devolucao.md` |
| `document_id` | `POL-001` |
| `source_priority` | `1` (SharePoint) / `2` (Planilha) / `3` (Wiki) |
| `section_path` | `3. Regras de Devolução > 3.1. Prazo geral` |

A prioridade de fonte segue a hierarquia definida no system prompt:

| Prioridade | Documentos | Tipo |
|---|---|---|
| 1 | `POL-*`, `PROC-*` | SharePoint normativo |
| 2 | `SLA-*` | Planilha de referência |
| 3 | `FAQ-*` | Wiki informal |
