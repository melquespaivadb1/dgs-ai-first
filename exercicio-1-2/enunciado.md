### Exercício 1.2


**Contexto:** Você precisa prototipar o system prompt do assistente e testar com cenários reais. Além do conteúdo do prompt, você precisa pensar em como o contexto é estruturado: o que é estático, o que é dinâmico, e como a ordem da informação afeta a resposta.

**Ferramentas a utilizar:** Claude (chat) — o próprio Claude serve como ambiente de teste do prompt

**Inputs fornecidos:**
- O cenário completo: *"A NovaTech é uma empresa de médio porte do setor de logística com 1.200 funcionários. Sua operação depende de um conjunto extenso de documentação interna: manuais de procedimento operacional, políticas de compliance, tabelas de SLA por tipo de cliente, regras de cálculo de frete, e normas de segurança de carga. Hoje, essa documentação está espalhada em três fontes: um SharePoint corporativo com ~800 documentos (PDFs e Word), uma wiki interna no Confluence com ~400 páginas, e uma pasta de rede com planilhas de referência atualizadas mensalmente. O problema: a equipe de atendimento ao cliente (45 pessoas) gasta em média 12 minutos por chamado buscando informações nessas fontes para responder dúvidas de clientes sobre prazos, regras de frete, políticas de devolução e procedimentos de reclamação. Isso gera atrasos, respostas inconsistentes e frustração tanto dos atendentes quanto dos clientes. A NovaTech contratou a DB1 para construir um assistente de IA que permita aos atendentes fazer perguntas em linguagem natural e receber respostas fundamentadas na documentação oficial da empresa, com indicação da fonte. O assistente será integrado ao ambiente Microsoft da NovaTech (Teams + SharePoint). Informações adicionais fornecidas pela NovaTech: - O volume médio é de 320 chamados/dia, dos quais ~60% envolvem consulta a documentação. - A documentação é atualizada mensalmente por 3 áreas diferentes (Operações, Compliance, Comercial), sem processo unificado de revisão. - Alguns documentos se contradizem entre versões — a equipe de atendimento hoje resolve isso "perguntando para quem sabe". - A NovaTech já tem licenças Microsoft 365 E3 e está disposta a provisionar Azure AI Services. - O projeto tem orçamento para 3 meses de discovery + desenvolvimento + go-live. - A expectativa da diretoria é reduzir o tempo médio de busca de 12 para menos de 2 minutos por chamado."*.
- Guardrails definidos pelo Product Specialist: *"O assistente deve (1) sempre citar a fonte do documento, (2) nunca inventar prazos ou valores que não estejam na documentação, (3) quando não encontrar resposta, dizer explicitamente que não encontrou e sugerir escalar para o supervisor, (4) responder em português formal mas acessível."*
- 3 chunks simulados de documentação (extraídos do **Anexo B** — o Anexo B contém o conjunto completo de chunks e o mapa de cobertura para validação):
  - Chunk A: *"Política de Devolução POL-001, seção 3.2: Mercadorias podem ser devolvidas em até 7 dias úteis após o recebimento, exceto cargas classificadas como perigosas (classes 1 a 6 da ANTT). O cliente deve abrir chamado no portal e anexar fotos da mercadoria."*
  - Chunk B: *"Tabela SLA-2024: Cliente Gold — resposta em até 2h, resolução em até 24h. Cliente Silver — resposta em até 4h, resolução em até 48h. Cliente Standard — resposta em até 8h, resolução em até 72h."*
  - Chunk C: *"PROC-042-v2, seção 2: Frete especial para cargas acima de 500kg: valor base × multiplicador regional. Região Sul: 1.3. Região Sudeste: 1.1. Região Norte: 1.8. Região Nordeste: 1.5. Região Centro-Oeste: 1.4."*
- Conceito de contexto estático vs dinâmico: *"Em um prompt de produção, algumas partes são estáticas (system prompt, guardrails — raramente mudam) e outras são dinâmicas (chunks recuperados, dados do cliente, histórico da conversa — mudam a cada query). A engenharia de contexto decide como essas partes se compõem: em que ordem, com que prioridade, e o que fazer quando o contexto total ultrapassa o orçamento."*

**Tarefa:**
1. Escreva um system prompt completo para o assistente, incorporando os guardrails e o contexto do projeto. Organize o prompt em seções claras: identidade, regras, formato de resposta, e instruções para uso dos chunks. Defina explicitamente a ordem de prioridade quando houver conflito entre fontes.

2. Documente a estrutura de contexto do prompt: identifique quais partes são estáticas (vão em toda query) e quais são dinâmicas (mudam por query). Estime o tamanho em tokens de cada parte.

3. Teste o prompt diretamente no **Claude**: abra uma conversa nova, cole o system prompt como instrução inicial junto com os chunks simulados, e faça estas 3 perguntas como se fosse o atendente:
   - "Qual o prazo de devolução para carga perigosa?"
   - "Meu cliente é Gold, qual o SLA de resolução?"
   - "Quanto custa o frete para 600kg para Manaus?"

4. Analise cada resposta: está correta? Citou a fonte? Respeitou os guardrails? Onde errou?

5. Itere o system prompt: reescreva partes que geraram respostas inadequadas e teste novamente.