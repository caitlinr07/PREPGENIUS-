const { OpenAI } = require('openai');

function hasOpenAICompatibleKey() {
  return Boolean(process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY);
}

function getAIModel(openAIModel = 'gpt-4o-mini') {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
  return openAIModel;
}

function createAIClient(options = {}) {
  const openRouter = Boolean(process.env.OPENROUTER_API_KEY);
  const apiKey = openRouter ? process.env.OPENROUTER_API_KEY : process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Set OPENROUTER_API_KEY or OPENAI_API_KEY in backend/.env.');

  return new OpenAI({
    apiKey,
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(openRouter ? {
      baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:5173',
        'X-Title': process.env.OPENROUTER_APP_NAME || 'PrepGenius'
      }
    } : {})
  });
}

module.exports = { createAIClient, getAIModel, hasOpenAICompatibleKey };