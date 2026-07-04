import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { CosmosClient } from '@azure/cosmos';
import { z } from 'zod';
import { logger } from '../../shared/logger.js';
import { config } from '../../shared/config.js';

const FeedbackSchema = z.object({
  queryId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
  attendantEmail: z.string().email(),
});

type FeedbackDocument = z.infer<typeof FeedbackSchema> & { timestamp: string };

export type FeedbackHandlerDeps = {
  persistFeedback: (feedback: FeedbackDocument) => Promise<void>;
};

export function createFeedbackHandler(deps: FeedbackHandlerDeps) {
  return async (request: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: 'invalid request body' } };
    }

    const parsed = FeedbackSchema.safeParse(body);
    if (!parsed.success) {
      return { status: 400, jsonBody: { error: parsed.error.flatten() } };
    }

    const feedback: FeedbackDocument = {
      ...parsed.data,
      timestamp: new Date().toISOString(),
    };

    logger.info({ queryId: feedback.queryId, rating: feedback.rating }, 'Feedback recebido');

    try {
      await deps.persistFeedback(feedback);
    } catch (err) {
      logger.error({ err }, 'Falha ao persistir feedback');
      return { status: 500, jsonBody: { error: 'storage_error' } };
    }

    return { status: 200, jsonBody: { ok: true } };
  };
}

const client = new CosmosClient(config.cosmosConnectionString);
const container = client
  .database(config.cosmosDatabaseName)
  .container(config.cosmosContainerFeedbacks);

app.http('feedback', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: createFeedbackHandler({
    persistFeedback: async (feedback) => {
      await container.items.create(feedback);
    },
  }),
});
