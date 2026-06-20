import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { logger } from '../../shared/logger.js';
import { CompletionError, EmbeddingError, SearchError, ValidationError } from '../../shared/errors.js';
import type { BuiltPrompt, EmbeddingResult, QueryResponse, SearchChunk } from '../../shared/types.js';
import { parseQueryRequest } from './validator.js';

export type QueryHandlerDeps = {
  generateEmbedding: (question: string) => Promise<EmbeddingResult>;
  searchChunks: (vector: number[]) => Promise<SearchChunk[]>;
  buildPrompt: (question: string, chunks: SearchChunk[]) => Promise<BuiltPrompt>;
  generateCompletion: (prompt: BuiltPrompt) => Promise<string>;
  buildResponse: (answer: string, chunks: SearchChunk[]) => QueryResponse;
};

export function createQueryHandler(deps: QueryHandlerDeps) {
  return async (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: 'invalid request body' } };
    }

    let parsed;
    try {
      parsed = parseQueryRequest(body);
    } catch (err) {
      if (err instanceof ValidationError) {
        return { status: 400, jsonBody: { error: err.message } };
      }
      throw err;
    }

    try {
      let t = Date.now();
      const embedding = await deps.generateEmbedding(parsed.question);
      logger.info({ step: 'embedding', durationMs: Date.now() - t });

      t = Date.now();
      const chunks = await deps.searchChunks(embedding.vector);
      logger.info({ step: 'search', durationMs: Date.now() - t });

      t = Date.now();
      const prompt = await deps.buildPrompt(parsed.question, chunks);
      logger.info({ step: 'prompt_build', durationMs: Date.now() - t });

      t = Date.now();
      const answer = await deps.generateCompletion(prompt);
      logger.info({ step: 'completion', durationMs: Date.now() - t });

      const response = deps.buildResponse(answer, chunks);
      return { status: 200, jsonBody: response };
    } catch (err) {
      if (err instanceof EmbeddingError || err instanceof SearchError || err instanceof CompletionError) {
        logger.error({ err }, 'upstream service failure');
        return { status: 502, jsonBody: { error: 'upstream_failure' } };
      }
      logger.error({ err }, 'unexpected internal error');
      return { status: 500, jsonBody: { error: 'internal_error' } };
    }
  };
}

const defaultStubs: QueryHandlerDeps = {
  generateEmbedding: async (_question) => ({ vector: [0.1, 0.2, 0.3], tokenCount: 5 }),
  searchChunks: async (_vector) => [],
  buildPrompt: async (question, _chunks) => ({
    systemMessage: 'You are a helpful assistant.',
    userMessage: question,
    estimatedTokens: 100,
  }),
  generateCompletion: async (_prompt) => 'Stub answer from default implementation.',
  buildResponse: (answer, chunks) => ({
    answer,
    sourceDocument: chunks[0]?.sourceDocument ?? null,
  }),
};

app.http('query', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: createQueryHandler(defaultStubs),
});
