# Plano: Pipeline RAG para NovaTech (PoC) (Plano desenvolvido utilizando Claude Code)

## Context
O Tech Lead precisa de uma prova de conceito funcional de RAG com ferramentas gratuitas/open-source antes de investir em licenças Azure. O objetivo é demonstrar que é possível ingerir a documentação interna da NovaTech, criar uma base de busca semântica e montar um prompt final (system prompt + contexto recuperado + pergunta) que possa ser passado diretamente ao Claude Chat para obter respostas embasadas na documentação oficial.

---

## Estrutura de arquivos a criar em `exercicio-1-3/`

```
exercicio-1-3/
├── documents/                        # existente
├── requirements.txt
├── ingest.py                         # Fase 1: ingestão
├── retrieval.py                      # Fase 2: busca semântica
├── prompt_builder.py                 # Fase 3: montagem de prompt
├── main.py                           # Entrypoint CLI unificado
└── chroma_data/                      # criado em runtime pelo ChromaDB
```

ChromaDB em **modo embedded persistente** — dados salvos localmente em `./chroma_data/` durante execução no ambiente virtual. Docker será adicionado na Fase 4.

---

## Fase 1 — Ingestão (`ingest.py`)

### Estratégia de chunking: Header-based Markdown splitting

**Justificativa:** Os documentos são Markdown com headers semânticos claros (`##`, `###`). Cada seção delimita uma unidade lógica distinta (ex.: "3.1 Prazo geral", "2. Tabela de SLAs", "Item 8 — Frete especial"). Separar por headers garante:
- Chunks coerentes semanticamente — o embedding captura o tópico inteiro, não fragmentos
- Citação de fonte natural (seção = chunk)
- Sem ruptura no meio de uma regra, tabela ou fórmula

Para seções muito longas (> 600 chars após split por header), aplicar `RecursiveCharacterTextSplitter` (chunk_size=600, overlap=50) como fallback — respeita o limite prático do `all-MiniLM-L6-v2` (~256 tokens, funciona bem até ~500).

### Metadados por chunk

Cada chunk armazena em ChromaDB:
| Campo | Exemplo | Uso |
|-------|---------|-----|
| `source_file` | `POL-001-politica-devolucao.md` | Citação da fonte |
| `document_id` | `POL-001` | Identificador curto |
| `source_priority` | `1` | Resolução de conflitos |
| `section_path` | `POL-001 > 3. Regras > 3.1 Prazo geral` | Citação precisa |

### Mapeamento de prioridade de fonte

| Arquivo | Prioridade | Tipo |
|---------|-----------|------|
| `POL-001-*.md` | 1 | SharePoint normativo |
| `PROC-042-*.md` | 1 | SharePoint normativo |
| `SLA-2024-*.md` | 2 | Planilha de referência |
| `FAQ-atendimento.md` | 3 | Wiki informal |

### Fluxo do script
1. Lê cada `.md` em `documents/`
2. Extrai metadados do cabeçalho do documento (versão, responsável, status)
3. Divide por headers `##`/`###`; aplica split secundário se necessário
4. Gera embeddings com `SentenceTransformer("all-MiniLM-L6-v2")`
5. Persiste chunks + metadados no ChromaDB (collection: `novatech_docs`)
6. Imprime resumo: N chunks criados por documento

---

## Fase 2 — Busca (`retrieval.py`)

### Função principal
```python
def search(question: str, n_results: int = 5) -> list[dict]:
    # retorna lista de: {text, source_file, document_id, source_priority, section_path, distance}
```

### Fluxo
1. Carrega o mesmo `SentenceTransformer("all-MiniLM-L6-v2")`
2. Conecta ao ChromaDB persistente
3. Gera embedding da pergunta
4. Chama `collection.query(query_embeddings=[...], n_results=n_results, include=["documents","metadatas","distances"])`
5. Retorna chunks ordenados por similaridade com metadados

**N padrão = 5** — suficiente para cobrir casos de conflito entre PROC-042-v1 e v2 sem sobrecarregar o contexto do prompt.

---

## Fase 3 — Montagem de Prompt (`prompt_builder.py`)

### Função principal
```python
def build_prompt(question: str, chunks: list[dict], system_prompt_path: str) -> str:
    # retorna string pronta para colar no Claude Chat
```

### Formato de saída

O prompt segue exatamente as tags esperadas pelo system prompt (`v2-system-prompt.md`):

```
[conteúdo de v2-system-prompt.md]

<context>
Chunk A: "[texto do chunk 1 — Fonte: POL-001, seção 3.1 Prazo geral]"

Chunk B: "[texto do chunk 2 — Fonte: SLA-2024, seção 2. Tabela de SLAs]"

...
</context>

<user_question>
[pergunta do usuário]
</user_question>
```

Cada chunk é formatado como: `"[texto] — Fonte: [document_id], [section_path]"` para que o modelo possa citar corretamente conforme as regras do system prompt.

---

## Entrypoint CLI (`main.py`)

Dois modos de uso:

```bash
# Modo ingestão (popula o ChromaDB)
python main.py ingest

# Modo consulta (gera o prompt final)
python main.py query "Qual o prazo para devolução de mercadorias?"
```

O modo `query` imprime o prompt completo no stdout — pode ser copiado e colado no Claude Chat.

---

## Docker

### `Dockerfile`
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
```

### `docker-compose.yml`
```yaml
version: '3.8'
services:
  rag:
    build: .
    volumes:
      - ./chroma_data:/app/chroma_data
      - ./documents:/app/documents
    stdin_open: true
    tty: true
```

### Comandos de execução
```bash
# Build
docker-compose build

# Ingestão
docker-compose run rag python main.py ingest

# Consulta
docker-compose run rag python main.py query "Qual o prazo de devolução?"
```

---

## `requirements.txt`

```
langchain
langchain-community
langchain-chroma
chromadb
sentence-transformers
```

`langchain-chroma` fornece a integração `Chroma` do LangChain diretamente, substituindo o acesso manual ao cliente `chromadb` onde conveniente.

---

## Fase 4 — Docker Compose (após validar o pipeline no venv)

Só após o pipeline funcionar localmente no venv (`ENV/`), adicionar:
- `Dockerfile` (FROM python:3.11-slim, copia código, instala requirements)
- `docker-compose.yml` com um único serviço `rag`, volume para `./chroma_data` e `./documents`

Comandos finais:
```bash
docker-compose build
docker-compose run rag python main.py ingest
docker-compose run rag python main.py query "Qual o prazo de devolução?"
```

---

## Verificação (end-to-end no venv)

```bash
# Ativar venv existente
source ENV/bin/activate

# Instalar dependências
pip install -r exercicio-1-3/requirements.txt

# Fase 1 — Ingestão
python exercicio-1-3/main.py ingest
# Esperado: "X chunks criados" por documento

# Fase 2+3 — Consulta (gera prompt completo)
python exercicio-1-3/main.py query "Qual o prazo de devolução?"
# Esperado: prompt com chunks de POL-001 dentro de <context>

python exercicio-1-3/main.py query "Como calcular frete especial para a região Norte?"
# Esperado: chunks de PROC-042-v1 e v2 (ambos prioridade 1), seção de conflito

# Validação final: colar o prompt gerado no Claude Chat
# e verificar se a resposta cita as fontes (ex.: POL-001, seção 3.1)
```

