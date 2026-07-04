import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpRequest } from '@azure/functions';
import type { InvocationContext } from '@azure/functions';

vi.mock('@azure/cosmos', () => ({
  CosmosClient: vi.fn().mockImplementation(() => ({
    database: vi.fn().mockReturnValue({
      container: vi.fn().mockReturnValue({
        items: { create: vi.fn() },
      }),
    }),
  })),
}));

vi.mock('../../../src/shared/config.js', () => ({
  config: {
    cosmosConnectionString: 'AccountEndpoint=https://mock.documents.azure.com:443/;AccountKey=bW9jaw==;',
    cosmosDatabaseName: 'novatech-test',
    cosmosContainerFeedbacks: 'feedbacks-test',
  },
}));

vi.mock('../../../src/shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import { createFeedbackHandler, type FeedbackHandlerDeps } from '../../../src/functions/feedback/handler.js';
import { logger } from '../../../src/shared/logger.js';

const mockContext = {} as InvocationContext;

const VALID_BODY = {
  queryId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  rating: 4,
  comment: 'Resposta muito clara e objetiva',
  attendantEmail: 'atendente@novatech.com',
};

function makeRequest(body: unknown): HttpRequest {
  return new HttpRequest({
    method: 'POST',
    url: 'http://localhost/api/feedback',
    body: { string: JSON.stringify(body) },
    headers: { 'content-type': 'application/json' },
  });
}

function makeMalformedRequest(): HttpRequest {
  return new HttpRequest({
    method: 'POST',
    url: 'http://localhost/api/feedback',
    body: { string: '{campo-sem-aspas: invalido' },
    headers: { 'content-type': 'application/json' },
  });
}

function makeDeps(overrides?: Partial<FeedbackHandlerDeps>): FeedbackHandlerDeps {
  return {
    persistFeedback: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('createFeedbackHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST com payload válido', () => {
    it('retorna HTTP 200 com { ok: true } e chama persistFeedback com os dados corretos', async () => {
      // Arrange
      const deps = makeDeps();
      const handler = createFeedbackHandler(deps);

      // Act
      const result = await handler(makeRequest(VALID_BODY), mockContext);

      // Assert
      expect(result.status).toBe(200);
      expect(result.jsonBody).toEqual({ ok: true });
      expect(deps.persistFeedback).toHaveBeenCalledOnce();
      const savedDoc = (deps.persistFeedback as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(savedDoc.queryId).toBe(VALID_BODY.queryId);
      expect(savedDoc.rating).toBe(VALID_BODY.rating);
      expect(savedDoc.comment).toBe(VALID_BODY.comment);
      expect(savedDoc.attendantEmail).toBe(VALID_BODY.attendantEmail);
      expect(savedDoc.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('retorna HTTP 200 quando comment está ausente (campo opcional)', async () => {
      // Arrange
      const { comment: _omit, ...bodyWithoutComment } = VALID_BODY;
      const deps = makeDeps();
      const handler = createFeedbackHandler(deps);

      // Act
      const result = await handler(makeRequest(bodyWithoutComment), mockContext);

      // Assert
      expect(result.status).toBe(200);
      expect(result.jsonBody).toEqual({ ok: true });
      expect(deps.persistFeedback).toHaveBeenCalledOnce();
    });

    it('aceita rating mínimo (1) sem erro', async () => {
      // Arrange
      const deps = makeDeps();
      const handler = createFeedbackHandler(deps);

      // Act
      const result = await handler(makeRequest({ ...VALID_BODY, rating: 1 }), mockContext);

      // Assert
      expect(result.status).toBe(200);
      expect(deps.persistFeedback).toHaveBeenCalledOnce();
    });

    it('aceita rating máximo (5) sem erro', async () => {
      // Arrange
      const deps = makeDeps();
      const handler = createFeedbackHandler(deps);

      // Act
      const result = await handler(makeRequest({ ...VALID_BODY, rating: 5 }), mockContext);

      // Assert
      expect(result.status).toBe(200);
      expect(deps.persistFeedback).toHaveBeenCalledOnce();
    });

    it('não inclui attendantEmail no log (proteção de PII)', async () => {
      // Arrange
      const deps = makeDeps();
      const handler = createFeedbackHandler(deps);

      // Act
      await handler(makeRequest(VALID_BODY), mockContext);

      // Assert
      expect(logger.info).toHaveBeenCalledOnce();
      const logPayload = (logger.info as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(logPayload).not.toHaveProperty('attendantEmail');
      expect(logPayload).toHaveProperty('queryId', VALID_BODY.queryId);
      expect(logPayload).toHaveProperty('rating', VALID_BODY.rating);
    });
  });

  describe('POST com body inválido (erro de parsing JSON)', () => {
    it('retorna HTTP 400 com "invalid request body" e não chama persistFeedback', async () => {
      // Arrange
      const deps = makeDeps();
      const handler = createFeedbackHandler(deps);

      // Act
      const result = await handler(makeMalformedRequest(), mockContext);

      // Assert
      expect(result.status).toBe(400);
      expect(result.jsonBody).toEqual({ error: 'invalid request body' });
      expect(deps.persistFeedback).not.toHaveBeenCalled();
    });
  });

  describe('POST com payload inválido (violação de schema Zod)', () => {
    it('retorna HTTP 400 quando queryId está ausente', async () => {
      // Arrange
      const { queryId: _omit, ...body } = VALID_BODY;
      const deps = makeDeps();
      const handler = createFeedbackHandler(deps);

      // Act
      const result = await handler(makeRequest(body), mockContext);

      // Assert
      expect(result.status).toBe(400);
      expect(deps.persistFeedback).not.toHaveBeenCalled();
    });

    it('retorna HTTP 400 quando queryId não é um UUID válido', async () => {
      // Arrange
      const deps = makeDeps();
      const handler = createFeedbackHandler(deps);

      // Act
      const result = await handler(makeRequest({ ...VALID_BODY, queryId: 'nao-e-uuid' }), mockContext);

      // Assert
      expect(result.status).toBe(400);
      expect(deps.persistFeedback).not.toHaveBeenCalled();
    });

    it('retorna HTTP 400 quando rating é 0 (abaixo do mínimo permitido)', async () => {
      // Arrange
      const deps = makeDeps();
      const handler = createFeedbackHandler(deps);

      // Act
      const result = await handler(makeRequest({ ...VALID_BODY, rating: 0 }), mockContext);

      // Assert
      expect(result.status).toBe(400);
      expect(deps.persistFeedback).not.toHaveBeenCalled();
    });

    it('retorna HTTP 400 quando rating é 6 (acima do máximo permitido)', async () => {
      // Arrange
      const deps = makeDeps();
      const handler = createFeedbackHandler(deps);

      // Act
      const result = await handler(makeRequest({ ...VALID_BODY, rating: 6 }), mockContext);

      // Assert
      expect(result.status).toBe(400);
      expect(deps.persistFeedback).not.toHaveBeenCalled();
    });

    it('retorna HTTP 400 quando rating não é um número', async () => {
      // Arrange
      const deps = makeDeps();
      const handler = createFeedbackHandler(deps);

      // Act
      const result = await handler(makeRequest({ ...VALID_BODY, rating: 'excelente' }), mockContext);

      // Assert
      expect(result.status).toBe(400);
      expect(deps.persistFeedback).not.toHaveBeenCalled();
    });

    it('retorna HTTP 400 quando attendantEmail está ausente', async () => {
      // Arrange
      const { attendantEmail: _omit, ...body } = VALID_BODY;
      const deps = makeDeps();
      const handler = createFeedbackHandler(deps);

      // Act
      const result = await handler(makeRequest(body), mockContext);

      // Assert
      expect(result.status).toBe(400);
      expect(deps.persistFeedback).not.toHaveBeenCalled();
    });

    it('retorna HTTP 400 quando attendantEmail não é um endereço de e-mail válido', async () => {
      // Arrange
      const deps = makeDeps();
      const handler = createFeedbackHandler(deps);

      // Act
      const result = await handler(makeRequest({ ...VALID_BODY, attendantEmail: 'nao-e-email' }), mockContext);

      // Assert
      expect(result.status).toBe(400);
      expect(deps.persistFeedback).not.toHaveBeenCalled();
    });
  });

  describe('POST com falha na persistência', () => {
    it('retorna HTTP 500 com "storage_error" quando persistFeedback rejeita', async () => {
      // Arrange
      const deps = makeDeps({
        persistFeedback: vi.fn().mockRejectedValue(new Error('Cosmos DB unavailable')),
      });
      const handler = createFeedbackHandler(deps);

      // Act
      const result = await handler(makeRequest(VALID_BODY), mockContext);

      // Assert
      expect(result.status).toBe(500);
      expect(result.jsonBody).toEqual({ error: 'storage_error' });
    });

    it('chama logger.error com o erro original quando persistFeedback rejeita', async () => {
      // Arrange
      const cosmosError = new Error('Cosmos DB unavailable');
      const deps = makeDeps({
        persistFeedback: vi.fn().mockRejectedValue(cosmosError),
      });
      const handler = createFeedbackHandler(deps);

      // Act
      await handler(makeRequest(VALID_BODY), mockContext);

      // Assert
      expect(logger.error).toHaveBeenCalledOnce();
      const logPayload = (logger.error as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(logPayload.err).toBe(cosmosError);
    });
  });
});
