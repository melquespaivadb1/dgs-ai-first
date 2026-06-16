export class ValidationError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'ValidationError';
    if (cause !== undefined) this.cause = cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class EmbeddingError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'EmbeddingError';
    if (cause !== undefined) this.cause = cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class SearchError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'SearchError';
    if (cause !== undefined) this.cause = cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class CompletionError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'CompletionError';
    if (cause !== undefined) this.cause = cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
