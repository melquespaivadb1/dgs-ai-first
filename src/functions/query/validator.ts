import { z } from 'zod';
import { ValidationError } from '../../shared/errors.js';
import type { QueryRequest } from '../../shared/types.js';

const schema = z.object({
  question: z
    .string({ required_error: 'question is required' })
    .min(1, 'question is required and cannot be empty')
    .max(500, 'question must be at most 500 characters'),
  sessionId: z.string().optional(),
});

export function parseQueryRequest(body: unknown): QueryRequest {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(result.error.issues[0].message);
  }
  return result.data;
}
