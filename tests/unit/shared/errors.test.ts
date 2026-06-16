import { describe, expect, it } from 'vitest';
import {
  CompletionError,
  EmbeddingError,
  SearchError,
  ValidationError,
} from '../../../src/shared/errors';

describe('errors', () => {
  it('new SearchError("msg") instanceof SearchError é true', () => {
    expect(new SearchError('msg')).toBeInstanceOf(SearchError);
  });

  it('new SearchError("msg") instanceof Error é true', () => {
    expect(new SearchError('msg')).toBeInstanceOf(Error);
  });

  it('new CompletionError("msg", originalErr).cause é igual a originalErr', () => {
    const original = new Error('causa original');
    const err = new CompletionError('msg', original);
    expect(err.cause).toBe(original);
  });

  it('new EmbeddingError("msg").name é "EmbeddingError"', () => {
    expect(new EmbeddingError('msg').name).toBe('EmbeddingError');
  });

  it('ValidationError instanceof ValidationError é true', () => {
    expect(new ValidationError('msg')).toBeInstanceOf(ValidationError);
  });

  it('ValidationError instanceof Error é true', () => {
    expect(new ValidationError('msg')).toBeInstanceOf(Error);
  });

  it('SearchError sem cause: cause é undefined', () => {
    expect(new SearchError('msg').cause).toBeUndefined();
  });

  it('EmbeddingError com cause: cause é acessível', () => {
    const original = new Error('embed fail');
    const err = new EmbeddingError('falhou', original);
    expect(err.cause).toBe(original);
  });
});
