import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('logger - NODE_ENV=test suprime output', () => {
  it('não chama process.stdout.write ao chamar logger.info', async () => {
    // vitest já seta NODE_ENV=test; o logger deve usar level=silent
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const { logger } = await import('../../../src/shared/logger');
    logger.info('mensagem de teste');

    expect(writeSpy).not.toHaveBeenCalled();
    writeSpy.mockRestore();
  });
});

describe('logger - controle por LOG_LEVEL', () => {
  const savedNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env.NODE_ENV = savedNodeEnv;
    delete process.env.LOG_LEVEL;
  });

  it('habilita debug quando LOG_LEVEL=debug', async () => {
    process.env.NODE_ENV = 'production';
    process.env.LOG_LEVEL = 'debug';

    const { logger } = await import('../../../src/shared/logger');

    expect(logger.level).toBe('debug');
  });

  it('não emite debug quando LOG_LEVEL=warn', async () => {
    process.env.NODE_ENV = 'production';
    process.env.LOG_LEVEL = 'warn';

    const { logger } = await import('../../../src/shared/logger');
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    logger.debug('não deve emitir');

    expect(writeSpy).not.toHaveBeenCalled();
    writeSpy.mockRestore();
  });
});
