import OpenAI from 'openai';
import { getEnv } from './env.js';

let cachedClient;

export function getOpenAIClient() {
  if (cachedClient) return cachedClient;
  const env = getEnv();
  cachedClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return cachedClient;
}

// Test-only helper so suites can inject a mock client.
export function __setOpenAIClient(client) {
  cachedClient = client;
}
