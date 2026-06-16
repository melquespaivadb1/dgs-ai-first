import { beforeEach, describe, expect, it, vi } from 'vitest';

const ALL_VARS: Record<string, string> = {
  AZURE_OPENAI_ENDPOINT: 'https://openai.example.com',
  AZURE_OPENAI_KEY: 'test-key',
  AZURE_OPENAI_DEPLOYMENT_CHAT: 'gpt-4o',
  AZURE_OPENAI_DEPLOYMENT_EMBEDDING: 'text-embedding-ada-002',
  AZURE_SEARCH_ENDPOINT: 'https://search.example.com',
  AZURE_SEARCH_KEY: 'search-key',
  AZURE_SEARCH_INDEX_NAME: 'my-index',
};

describe('config', () => {
  beforeEach(() => {
    vi.resetModules();
    for (const key of Object.keys(ALL_VARS)) {
      delete process.env[key];
    }
  });

  it('throws when AZURE_OPENAI_ENDPOINT is missing', async () => {
    const { AZURE_OPENAI_ENDPOINT: _omit, ...rest } = ALL_VARS;
    Object.assign(process.env, rest);

    await expect(import('../../../src/shared/config')).rejects.toThrow(
      'Missing required environment variable: AZURE_OPENAI_ENDPOINT',
    );
  });

  it('exports config with correct values when all vars present', async () => {
    Object.assign(process.env, ALL_VARS);

    const { config } = await import('../../../src/shared/config');

    expect(config.azureOpenAiEndpoint).toBe(ALL_VARS.AZURE_OPENAI_ENDPOINT);
    expect(config.azureOpenAiKey).toBe(ALL_VARS.AZURE_OPENAI_KEY);
    expect(config.azureOpenAiDeploymentChat).toBe(ALL_VARS.AZURE_OPENAI_DEPLOYMENT_CHAT);
    expect(config.azureOpenAiDeploymentEmbedding).toBe(ALL_VARS.AZURE_OPENAI_DEPLOYMENT_EMBEDDING);
    expect(config.azureSearchEndpoint).toBe(ALL_VARS.AZURE_SEARCH_ENDPOINT);
    expect(config.azureSearchKey).toBe(ALL_VARS.AZURE_SEARCH_KEY);
    expect(config.azureSearchIndexName).toBe(ALL_VARS.AZURE_SEARCH_INDEX_NAME);
  });
});
