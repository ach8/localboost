import { z } from 'zod';
import { prisma as defaultPrisma } from './prisma.js';
import { getOpenAIClient } from './openai.js';

const reviewInputSchema = z.object({
  reviewId: z.string().min(1),
  businessName: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(5000).optional().default(''),
  reviewerName: z.string().max(200).optional(),
});

const SYSTEM_PROMPT =
  'You are a helpful assistant that writes short, polite, professional responses ' +
  'from a local business owner to Google customer reviews. Responses must be warm, ' +
  'acknowledge the feedback, never make promises about refunds, and stay under 120 words.';

export function buildUserPrompt({ businessName, rating, comment, reviewerName }) {
  const trimmedComment = (comment || '').trim();
  return [
    `Business: ${businessName}`,
    `Reviewer: ${reviewerName || 'Anonymous'}`,
    `Rating: ${rating}/5`,
    `Review: ${trimmedComment || '(no comment provided)'}`,
    '',
    'Write a response addressed to the reviewer.',
  ].join('\n');
}

/**
 * Generate an AI response for a Google customer review and persist it.
 *
 * Dependencies (prisma, openai, model) can be injected to keep tests hermetic.
 */
export async function generateAndStoreReviewResponse(rawInput, deps = {}) {
  const input = reviewInputSchema.parse(rawInput);

  const prisma = deps.prisma ?? defaultPrisma;
  const openai = deps.openai ?? getOpenAIClient();
  const model = deps.model ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(input) },
    ],
    temperature: 0.7,
    max_tokens: 300,
  });

  const content = completion?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('OpenAI returned an empty response');
  }

  const usage = completion.usage ?? {};

  const saved = await prisma.reviewResponse.upsert({
    where: { reviewId: input.reviewId },
    create: {
      reviewId: input.reviewId,
      content,
      model,
      promptTokens: usage.prompt_tokens ?? null,
      completionTokens: usage.completion_tokens ?? null,
      status: 'DRAFT',
    },
    update: {
      content,
      model,
      promptTokens: usage.prompt_tokens ?? null,
      completionTokens: usage.completion_tokens ?? null,
      status: 'DRAFT',
    },
  });

  return saved;
}
