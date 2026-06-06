# Prompt para planejamento do Claude

O Tech Lead quer uma prova de conceito funcional de um pipeline de RAG usando ferramentas gratuitas e open-source, antes de investir em licenças Azure. Você precisa construir um protótipo que ingira documentos, crie embeddings, armazene num vector store, e responda perguntas com base nos documentos. O cenário do problema é:

## O Cenário

A NovaTech é uma empresa de médio porte do setor de logística com 1.200 funcionários. Sua operação depende de um conjunto extenso de documentação interna: manuais de procedimento operacional, políticas de compliance, tabelas de SLA por tipo de cliente, regras de cálculo de frete, e normas de segurança de carga.

Hoje, essa documentação está espalhada em três fontes: um SharePoint corporativo com ~800 documentos (PDFs e Word), uma wiki interna no Confluence com ~400 páginas, e uma pasta de rede com planilhas de referência atualizadas mensalmente.

O problema: a equipe de atendimento ao cliente (45 pessoas) gasta em média 12 minutos por chamado buscando informações nessas fontes para responder dúvidas de clientes sobre prazos, regras de frete, políticas de devolução e procedimentos de reclamação. Isso gera atrasos, respostas inconsistentes e frustração tanto dos atendentes quanto dos clientes.

A NovaTech contratou a DB1 para construir um assistente de IA que permita aos atendentes fazer perguntas em linguagem natural e receber respostas fundamentadas na documentação oficial da empresa, com indicação da fonte. O assistente será integrado ao ambiente Microsoft da NovaTech (Teams + SharePoint).

Algumas orientações:
- As documentações se encontram no arquivo exercicio-1-3/documents.
- O system prompt a ser utilizado se encontra em exercicio-1-2/v2-system-prompt.md.
- As seguintes ferramentas DEVEM ser utilizadas: 
	- **Python** como linguagem.
	- **ChromaDB** como vector store local (pip install chromadb).
	- **sentence-transformers** para embeddings open-source (pip install sentence-transformers — modelo sugerido: `all-MiniLM-L6-v2`).
	- **LangChain** ou código manual para orquestração (pip install langchain).
- Utilizamos o docker compose para criação de um container capaz de gerenciar a nossa aplicação.
- A prova de conceito deve ser inserida dentro da pasta exercicio-1-3.

Divida o plano em 3 fases:
- **Ingestão:** Um script que lê os documentos listados em exercicio-1-3/documents, divide em chunks (defina a estratégia de chunking e justifique), gera embeddings, e armazena no ChromaDB.
- **Busca:** Uma função que recebe uma pergunta, gera o embedding da pergunta, busca os N chunks mais similares no ChromaDB, e retorna os chunks com score de similaridade.
- **Montagem de prompt:** Uma função que recebe os chunks recuperados e a pergunta, e monta o prompt completo (system prompt + chunks + pergunta) pronto para enviar ao LLM.

Ao final, quando a prova de conceito estiver pronta, o resultado deve ser um prompt unindo o system prompt, os chunks recuperados e a pergunta do usuário, que eu posso passar para o Claude chat, e conseguir respostas baseadas no contexto. 

Pense passo a passo. 