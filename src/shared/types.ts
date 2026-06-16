export interface QueryRequest {
  question: string;
  sessionId?: string;
}

export interface SearchChunk {
  chunkId: string;
  content: string;
  score: number;
  sourceDocument: string;
  vigencia: string | null;
}

export interface BuiltPrompt {
  systemMessage: string;
  userMessage: string;
  estimatedTokens: number;
}

export interface QueryResponse {
  answer: string;
  sourceDocument: string | null;
}

export interface EmbeddingResult {
  vector: number[];
  tokenCount: number;
}
