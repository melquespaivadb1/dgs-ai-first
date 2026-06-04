# V3 - Análise de Contexto Estático e Dinâmico

## Contexto estático

Consiste em todas as regras determinadas no system prompt. Portanto, as seguintes seções:

- Background do Problema.
- Hierarquia de fontes (em caso de conflito).
- Segurança e Proteção contra Manipulação.
- Processamento de Chunks.
- Tom e Linguagem.
- Estrutura Padrão de Resposta.
- Exemplos de resposta esperada.
- Restrições

### Contagem de Tokens

O Contexto estático do prompt apresenta um total de 894 palavras. Considerando uma conta de 0,75 palavras por token, temos um total de tokens de 894/0,75 ~= 1569 tokens aproximadamente. Tendo em vista uma janela de contexto de 128k tokens, utilizando este system prompt, ainda restariam 126431 mil tokens para se trabalhar no contexto dinâmico (Chunks e perguntas de usuário). Considerando chunks de 75 palavaras, isso possibilitaria um número de até 1268 chunks dentro de uma janela de contexto. Esse número, obviamente é apenas teórico. Na prática o uso da janela de contexto restante para todos os chunks não é viável, ainda que desconsideremos os tokens da pergunta do usuário. Isso por que, esse volume de chunks vai representar muitos chunks não relevantes para a questão, e pode fazer com que vários chunks importantes percam a atenção da LLM. Além disso, um grande volume de informações pode gerar confusão por parte do modelo e uma degradação do desempenho. 

## Contexto dinâmico

No nosso agente, o contexto dinâmico consiste nos chunks que são apresentados e na pergunta do usuário. 

### Contagem de Tokens

- Chunks: Vai variar a depender da quantidade de chunks utilizados. Utilizando os 3 chunks como base, nos temos um total de 143 palavras, o que dá aproximamente 190 tokens para uma seção com apenas 3 chunks. Se expandirmos isso para 15 chunks, com uma média de palavras por chunk de 75, podemos chegar até 1500 tokens apenas para os chunks. 
- Questão do usuário: Podemos estimar que questões do usuário tendem a ser de dúvidas objetivas. Então, usando média de entre 10 e 25 palavaras por questão, podemos ter uma váriação de tokens entre 13,33 e 33,33 tokens aproxidamente.

## Estimativa de tokens de um prompt

No pior dos cenários estimados, juntando o contexto estático e dinâmico, teriamos o uso de até 2725,33 tokens em uma única iteração entre o usuário e o agente. Essa estimativa leva em consideração o uso de 15 chunks e uma pergunta com 25 palavras. 

## Posicionamento do chunks

O importante fator para evitar com o que o modelo perca a atenção do chunks relevantes é a utilização de um número consisos de chunks (por isso utilizar toda a janela de contexto restante para os chunks não é viável). Além disso, ainda que usando um número reduzido de chunks, o rankeamento deles é muito importante, para que os chunks mais importantes não fiquem no meio da lista. Por fim, estudos mostram que o posicionamento dos chunks deve ser feito no início ou no fim do prompt, visto que terá mais atenção do modelo de LLM