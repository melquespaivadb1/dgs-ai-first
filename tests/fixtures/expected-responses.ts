import type { QueryResponse } from '../../src/shared/types.js';

export const expectedResponses: QueryResponse[] = [
  {
    answer: 'O prazo de reembolso para produtos com defeito é de 30 dias corridos a partir da data de compra.',
    sourceDocument: 'politica-reembolso.pdf',
  },
  {
    answer: 'Produtos com defeito de fabricação têm garantia de 12 meses conforme o Código de Defesa do Consumidor.',
    sourceDocument: 'garantia-produtos.pdf',
  },
  {
    answer: 'Não foram encontradas informações específicas para essa consulta.',
    sourceDocument: null,
  },
];
