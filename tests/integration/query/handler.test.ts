import { describe, it, expect, vi } from 'vitest';
import { HttpRequest } from '@azure/functions';
import type { InvocationContext } from '@azure/functions';
import { createQueryHandler, type QueryHandlerDeps } from '../../../src/functions/query/handler.js';
import { CompletionError, EmbeddingError, SearchError } from '../../../src/shared/errors.js';
import { mockChunks } from '../../fixtures/chunks.js';
import { expectedResponses } from '../../fixtures/expected-responses.js';

const mockContext = {} as InvocationContext;

function makeRequest(body: unknown): HttpRequest {
  return new HttpRequest({
    method: 'POST',
    url: 'http://localhost/api/query',
    body: { string: JSON.stringify(body) },
    headers: { 'content-type': 'application/json' },
  });
}

function makeDeps(overrides?: Partial<QueryHandlerDeps>): QueryHandlerDeps {
  return {
    generateEmbedding: vi.fn().mockResolvedValue({ vector: [0.1, 0.2], tokenCount: 5 }),
    searchChunks: vi.fn().mockResolvedValue(mockChunks),
    buildPrompt: vi.fn().mockResolvedValue({
      systemMessage: 'You are helpful.',
      userMessage: 'test question',
      estimatedTokens: 100,
    }),
    generateCompletion: vi.fn().mockResolvedValue(expectedResponses[0].answer),
    buildResponse: vi.fn().mockReturnValue(expectedResponses[0]),
    ...overrides,
  };
}

describe('createQueryHandler', () => {
  it('POST with valid question returns HTTP 200 with answer and sourceDocument', async () => {
    const deps = makeDeps();
    const handler = createQueryHandler(deps);
    const result = await handler(makeRequest({ question: 'Qual é a política de reembolso?' }), mockContext);

    expect(result.status).toBe(200);
    const body = result.jsonBody as Record<string, unknown>;
    expect(body).toHaveProperty('answer');
    expect(body).toHaveProperty('sourceDocument');
  });

  it('POST with empty question returns HTTP 400 without calling any dep', async () => {
    const deps = makeDeps();
    const handler = createQueryHandler(deps);
    const result = await handler(makeRequest({ question: '' }), mockContext);

    expect(result.status).toBe(400);
    expect((result.jsonBody as Record<string, unknown>).error).toBe('question is required and cannot be empty');
    expect(deps.generateEmbedding).not.toHaveBeenCalled();
    expect(deps.searchChunks).not.toHaveBeenCalled();
    expect(deps.buildPrompt).not.toHaveBeenCalled();
    expect(deps.generateCompletion).not.toHaveBeenCalled();
    expect(deps.buildResponse).not.toHaveBeenCalled();
  });

  it('POST with 501-char question returns HTTP 400 without calling any dep', async () => {
    const deps = makeDeps();
    const handler = createQueryHandler(deps);
    const result = await handler(makeRequest({ question: 'a'.repeat(501) }), mockContext);

    expect(result.status).toBe(400);
    expect(deps.generateEmbedding).not.toHaveBeenCalled();
  });

  it('generateEmbedding throwing EmbeddingError returns HTTP 502 with upstream_failure', async () => {
    const deps = makeDeps({
      generateEmbedding: vi.fn().mockRejectedValue(new EmbeddingError('embedding failed')),
    });
    const handler = createQueryHandler(deps);
    const result = await handler(makeRequest({ question: 'test question' }), mockContext);

    expect(result.status).toBe(502);
    expect(result.jsonBody).toEqual({ error: 'upstream_failure' });
  });

  it('searchChunks throwing SearchError returns HTTP 502 with upstream_failure', async () => {
    const deps = makeDeps({
      searchChunks: vi.fn().mockRejectedValue(new SearchError('search failed')),
    });
    const handler = createQueryHandler(deps);
    const result = await handler(makeRequest({ question: 'test question' }), mockContext);

    expect(result.status).toBe(502);
    expect(result.jsonBody).toEqual({ error: 'upstream_failure' });
  });

  it('generateCompletion throwing CompletionError returns HTTP 502 with upstream_failure', async () => {
    const deps = makeDeps({
      generateCompletion: vi.fn().mockRejectedValue(new CompletionError('completion failed')),
    });
    const handler = createQueryHandler(deps);
    const result = await handler(makeRequest({ question: 'test question' }), mockContext);

    expect(result.status).toBe(502);
    expect(result.jsonBody).toEqual({ error: 'upstream_failure' });
  });

  it('searchChunks returning empty array returns HTTP 200 with sourceDocument null', async () => {
    const deps = makeDeps({
      searchChunks: vi.fn().mockResolvedValue([]),
      buildResponse: vi.fn().mockReturnValue({ answer: 'No relevant results found.', sourceDocument: null }),
    });
    const handler = createQueryHandler(deps);
    const result = await handler(makeRequest({ question: 'test question' }), mockContext);

    expect(result.status).toBe(200);
    expect((result.jsonBody as Record<string, unknown>).sourceDocument).toBeNull();
  });

  it('unexpected error returns HTTP 500 with internal_error', async () => {
    const deps = makeDeps({
      generateEmbedding: vi.fn().mockRejectedValue(new Error('unexpected')),
    });
    const handler = createQueryHandler(deps);
    const result = await handler(makeRequest({ question: 'test question' }), mockContext);

    expect(result.status).toBe(500);
    expect(result.jsonBody).toEqual({ error: 'internal_error' });
  });
});
