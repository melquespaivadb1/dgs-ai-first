# Riscos

1. Prompt injection por dentro das documentações:
    - O modelo lê conteúdo das docs e dos chunks e inclui no contexto, dando aerturar para instruções maliciosas no meio dos docs.
    - Mitigações: Sanititização de chunks e de documentações no pipeline de ingestão; Separação clara dos dados recuperados de instruções do sistema usando delimitadores como <document></document>; 
2. Servidores de filesystem e git não fixam versão. Portanto, versões comprometidas podem ser executados silenciosamente com as mesmas permissões do usuário local
    - Mitigações: Fixar versões dentro da configuração dos mcp servers. 