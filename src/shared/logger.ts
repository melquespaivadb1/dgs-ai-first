import pino from 'pino';

const level = process.env.NODE_ENV === 'test'
  ? 'silent'
  : (process.env.LOG_LEVEL ?? 'info');

export const logger = pino({ level });
