function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  azureOpenAiEndpoint: requireEnv('AZURE_OPENAI_ENDPOINT'),
  azureOpenAiKey: requireEnv('AZURE_OPENAI_KEY'),
  azureOpenAiDeploymentChat: requireEnv('AZURE_OPENAI_DEPLOYMENT_CHAT'),
  azureOpenAiDeploymentEmbedding: requireEnv('AZURE_OPENAI_DEPLOYMENT_EMBEDDING'),
  azureSearchEndpoint: requireEnv('AZURE_SEARCH_ENDPOINT'),
  azureSearchKey: requireEnv('AZURE_SEARCH_KEY'),
  azureSearchIndexName: requireEnv('AZURE_SEARCH_INDEX_NAME'),
};
