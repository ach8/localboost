import OpenAI from "openai";
import { getEnv } from "./env";

let openaiInstance = null;

export function getOpenAIClient() {
  if (!openaiInstance) {
    openaiInstance = new OpenAI({ apiKey: getEnv("OPENAI_API_KEY") });
  }
  return openaiInstance;
}

export function resetOpenAIClient() {
  openaiInstance = null;
}
