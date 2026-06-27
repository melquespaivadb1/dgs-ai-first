# ADR-0001: Estratégia de detecção para o guardrail 4.2 — carga perigosa + devolução

## Status: Proposto

## Contexto

O guardrail 4.2 implementado em `src/services/response-validator.ts` bloqueia respostas do modelo que mencionem "carga perigosa" e "devolução" sem conter uma negativa explícita, conforme exige a POL-001 §3.2.

A implementação atual usa uma lista fechada de 8 frases exatas (`REQUIRED_NEGATION_TERMS`) para detectar se a resposta contém a negativa obrigatória. O code review (GAP-02) identificou que essa abordagem produz **falsos positivos**: respostas corretas que usem fraseamentos alternativos válidos — como "é proibida", "é vedada", "não é permitida" — são bloqueadas pelo guardrail mesmo estando em conformidade com a política.

O risco é assimétrico:
- **Falso positivo** (bloqueia resposta correta): atendente recebe mensagem de fallback genérica em vez da resposta útil — degradação de experiência.
- **Falso negativo** (deixa passar resposta errada): cliente recebe informação que viola POL-001 §3.2 — risco de compliance e segurança.

Falso negativo é mais grave neste contexto.

## Decisão

Adotar a **abordagem híbrida**: a resposta passa o guardrail se contém qualquer termo de negação linguística **OU** qualquer indicador de roteamento obrigatório. A ausência de ambos bloqueia a resposta.

```ts
const hasNegation = NEGATION_TERMS.some((term) => lower.includes(term));
const hasEscalation = ESCALATION_INDICATORS.some((term) => lower.includes(term));

if (!hasNegation && !hasEscalation) {
  ctx.addIssue({ ... });
}
```

Com dois conjuntos de termos independentes:

```ts
// Negação linguística explícita
const NEGATION_TERMS = [
  'não são elegíveis',
  'não é elegível',
  'não pode pelo processo padrão',
  'não se aplica ao processo padrão',
  'não pode ser devolvid',
  'é proibida', 'são proibidas',
  'é vedada', 'são vedadas',
  'não é permitida', 'não são permitidas',
  'não é possível', 'não são possíveis',
];

// Roteamento obrigatório exigido pela POL-001 §3.2
const ESCALATION_INDICATORS = [
  'gestão de riscos',
  'ramal 4500',
  'tratamento especial',
  'tratamento individualizado',
];
```

## Consequências

**Positivas:**
- Reduz falsos positivos: respostas corretas com fraseamento alternativo passam desde que contenham negação OU roteamento.
- Ancora o guardrail ao *outcome* operacional da POL-001 §3.2, não apenas à forma linguística — uma resposta que menciona o ramal 4500 está cumprindo a política independentemente das palavras usadas para negar.
- Mantém determinismo total: sem chamadas externas, sem latência adicional, comportamento 100% previsível.
- Ambos os conjuntos de termos são mantidos separados e nomeados com referência à política, facilitando revisão futura.

**Negativas:**
- Continua sendo mundo fechado: novas fraseologias adotadas por versões futuras do modelo exigirão atualização manual das listas.
- A condição de OU pode, em teoria, deixar passar uma resposta que menciona "ramal 4500" em contexto diferente sem negar a devolução — edge case improvável dado o contexto, mas possível.
- Aumenta levemente a complexidade da lógica de `superRefine`.

## Alternativas consideradas

**Expandir apenas a lista de negação (Opção A):** Resolve parcialmente os falsos positivos, mas mantém o problema estrutural de mundo fechado sem introduzir o critério de roteamento. Descartada por ser uma solução incompleta.

**Detectar afirmação em vez de negação (Opção B):** Inverte a lógica para bloquear apenas quando há afirmação explícita de que a devolução é possível. Descartada porque o vocabulário de afirmação implícita é mais aberto e o risco de falso negativo (deixar passar resposta errada) é maior.

**Checar apenas roteamento obrigatório (Opção C):** Bloqueia respostas que não mencionem Gestão de Riscos ou ramal 4500. Descartada por ser mais restritiva do que necessário: uma resposta concisa e correta como "carga perigosa não é elegível para devolução" seria bloqueada por não incluir o roteamento explícito.

**Guardrail semântico via modelo secundário (Opção E):** Delegar a classificação a um modelo menor (`haiku-4-5`). Semanticamente robusto, mas quebra o requisito de determinismo do guardrail, adiciona latência e custo por chamada, e introduz uma segunda dependência probabilística em um ponto de controle de segurança.
