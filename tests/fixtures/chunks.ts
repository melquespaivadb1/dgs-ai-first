import type { SearchChunk } from '../../src/shared/types.js';

export const mockChunks: SearchChunk[] = [
  {
    chunkId: 'chunk-001',
    content: 'O prazo de reembolso para produtos com defeito é de 30 dias corridos a partir da data de compra.',
    score: 0.95,
    sourceDocument: 'politica-reembolso.pdf',
    vigencia: '2024-01-01',
  },
  {
    chunkId: 'chunk-002',
    content: 'Produtos com defeito de fabricação têm garantia de 12 meses conforme o Código de Defesa do Consumidor.',
    score: 0.88,
    sourceDocument: 'garantia-produtos.pdf',
    vigencia: null,
  },
  {
    chunkId: 'chunk-003',
    content: 'Para solicitar reembolso, o cliente deve apresentar nota fiscal e descrição do defeito.',
    score: 0.82,
    sourceDocument: 'politica-reembolso.pdf',
    vigencia: '2023-06-15',
  },
  {
    chunkId: 'chunk-004',
    content: 'O prazo de entrega padrão é de 5 a 10 dias úteis para capitais e 10 a 15 dias para interior.',
    score: 0.75,
    sourceDocument: 'politica-entrega.pdf',
    vigencia: null,
  },
  {
    chunkId: 'chunk-005',
    content: 'Produtos eletrônicos possuem suporte técnico por 24 meses.',
    score: 0.75,
    sourceDocument: 'suporte-tecnico.pdf',
    vigencia: '2024-03-20',
  },
  {
    chunkId: 'chunk-006',
    content: 'O serviço de atendimento ao cliente funciona de segunda a sexta, das 8h às 18h.',
    score: 0.60,
    sourceDocument: 'horario-atendimento.pdf',
    vigencia: null,
  },
];
