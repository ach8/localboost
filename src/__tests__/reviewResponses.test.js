import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildUserPrompt,
  generateAndStoreReviewResponse,
} from '@/lib/reviewResponses';

function makeMockOpenAI(content, usage = { prompt_tokens: 42, completion_tokens: 17 }) {
  const create = vi.fn().mockResolvedValue({
    choices: [{ message: { content } }],
    usage,
  });
  return {
    client: { chat: { completions: { create } } },
    create,
  };
}

function makeMockPrisma() {
  const upsert = vi.fn().mockImplementation(async ({ where, create }) => ({
    id: 'resp_1',
    reviewId: where.reviewId,
    ...create,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  }));
  return { client: { reviewResponse: { upsert } }, upsert };
}

describe('buildUserPrompt', () => {
  it('formats a prompt with all fields', () => {
    const prompt = buildUserPrompt({
      businessName: 'Sunrise Cafe',
      rating: 5,
      comment: 'Loved the coffee!',
      reviewerName: 'Jane',
    });
    expect(prompt).toContain('Business: Sunrise Cafe');
    expect(prompt).toContain('Reviewer: Jane');
    expect(prompt).toContain('Rating: 5/5');
    expect(prompt).toContain('Review: Loved the coffee!');
  });

  it('falls back gracefully when optional fields are missing', () => {
    const prompt = buildUserPrompt({
      businessName: 'Sunrise Cafe',
      rating: 3,
      comment: '',
    });
    expect(prompt).toContain('Reviewer: Anonymous');
    expect(prompt).toContain('Review: (no comment provided)');
  });
});

describe('generateAndStoreReviewResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validInput = {
    reviewId: 'review_123',
    businessName: 'Sunrise Cafe',
    rating: 5,
    comment: 'Loved the coffee!',
    reviewerName: 'Jane',
  };

  it('calls OpenAI with the correct model and messages, then stores the response', async () => {
    const openai = makeMockOpenAI('Thank you so much for the kind words, Jane!');
    const prisma = makeMockPrisma();

    const result = await generateAndStoreReviewResponse(validInput, {
      openai: openai.client,
      prisma: prisma.client,
      model: 'gpt-4o-mini',
    });

    expect(openai.create).toHaveBeenCalledTimes(1);
    const callArgs = openai.create.mock.calls[0][0];
    expect(callArgs.model).toBe('gpt-4o-mini');
    expect(callArgs.messages).toHaveLength(2);
    expect(callArgs.messages[0].role).toBe('system');
    expect(callArgs.messages[1].content).toContain('Sunrise Cafe');

    expect(prisma.upsert).toHaveBeenCalledTimes(1);
    const upsertArgs = prisma.upsert.mock.calls[0][0];
    expect(upsertArgs.where).toEqual({ reviewId: 'review_123' });
    expect(upsertArgs.create.content).toBe('Thank you so much for the kind words, Jane!');
    expect(upsertArgs.create.model).toBe('gpt-4o-mini');
    expect(upsertArgs.create.promptTokens).toBe(42);
    expect(upsertArgs.create.completionTokens).toBe(17);
    expect(upsertArgs.create.status).toBe('DRAFT');

    expect(result.content).toBe('Thank you so much for the kind words, Jane!');
    expect(result.reviewId).toBe('review_123');
  });

  it('rejects invalid inputs with a ZodError (rating out of range)', async () => {
    const openai = makeMockOpenAI('should not be called');
    const prisma = makeMockPrisma();

    await expect(
      generateAndStoreReviewResponse(
        { ...validInput, rating: 99 },
        { openai: openai.client, prisma: prisma.client },
      ),
    ).rejects.toThrow();

    expect(openai.create).not.toHaveBeenCalled();
    expect(prisma.upsert).not.toHaveBeenCalled();
  });

  it('rejects invalid inputs when reviewId is missing', async () => {
    const openai = makeMockOpenAI('should not be called');
    const prisma = makeMockPrisma();

    await expect(
      generateAndStoreReviewResponse(
        { ...validInput, reviewId: '' },
        { openai: openai.client, prisma: prisma.client },
      ),
    ).rejects.toThrow();

    expect(openai.create).not.toHaveBeenCalled();
  });

  it('throws when OpenAI returns an empty completion', async () => {
    const openai = makeMockOpenAI('   '); // whitespace => empty after trim
    const prisma = makeMockPrisma();

    await expect(
      generateAndStoreReviewResponse(validInput, {
        openai: openai.client,
        prisma: prisma.client,
      }),
    ).rejects.toThrow(/empty response/i);

    expect(prisma.upsert).not.toHaveBeenCalled();
  });

  it('does not call OpenAI or database when validation fails (no leakage of secrets)', async () => {
    const openai = makeMockOpenAI('hi');
    const prisma = makeMockPrisma();

    await expect(
      generateAndStoreReviewResponse(
        { businessName: 'X' }, // missing required fields
        { openai: openai.client, prisma: prisma.client },
      ),
    ).rejects.toThrow();

    expect(openai.create).not.toHaveBeenCalled();
    expect(prisma.upsert).not.toHaveBeenCalled();
  });

  it('handles missing usage metadata gracefully', async () => {
    const openai = makeMockOpenAI('Thanks!', undefined);
    const prisma = makeMockPrisma();

    await generateAndStoreReviewResponse(validInput, {
      openai: openai.client,
      prisma: prisma.client,
    });

    const upsertArgs = prisma.upsert.mock.calls[0][0];
    expect(upsertArgs.create.promptTokens).toBeNull();
    expect(upsertArgs.create.completionTokens).toBeNull();
  });

  describe('moderation', () => {
    it('rejects and does NOT persist when the lexical blocklist flags the content', async () => {
      const openai = makeMockOpenAI('Thanks, but honestly: fuck your complaint.');
      const prisma = makeMockPrisma();

      await expect(
        generateAndStoreReviewResponse(validInput, {
          openai: openai.client,
          prisma: prisma.client,
        }),
      ).rejects.toMatchObject({
        name: 'ModerationError',
        categories: expect.arrayContaining(['lexical_blocklist']),
      });

      expect(openai.create).toHaveBeenCalledTimes(1);
      expect(prisma.upsert).not.toHaveBeenCalled();
    });

    it('rejects and does NOT persist when a mocked moderation service flags the content', async () => {
      const openai = makeMockOpenAI('Clean-looking text that service will flag.');
      const prisma = makeMockPrisma();

      const moderationClient = {
        moderations: {
          create: vi.fn().mockResolvedValue({
            results: [
              {
                flagged: true,
                categories: { harassment: true, hate: false, violence: true },
              },
            ],
          }),
        },
      };

      await expect(
        generateAndStoreReviewResponse(validInput, {
          openai: openai.client,
          prisma: prisma.client,
          moderationClient,
        }),
      ).rejects.toMatchObject({
        name: 'ModerationError',
        categories: expect.arrayContaining(['harassment', 'violence']),
      });

      expect(moderationClient.moderations.create).toHaveBeenCalledWith({
        input: 'Clean-looking text that service will flag.',
      });
      expect(prisma.upsert).not.toHaveBeenCalled();
    });

    it('fails closed (rejects + no persistence) when the moderation service errors', async () => {
      const openai = makeMockOpenAI('Totally benign response.');
      const prisma = makeMockPrisma();

      const moderationClient = {
        moderations: {
          create: vi.fn().mockRejectedValue(new Error('network boom')),
        },
      };

      await expect(
        generateAndStoreReviewResponse(validInput, {
          openai: openai.client,
          prisma: prisma.client,
          moderationClient,
        }),
      ).rejects.toMatchObject({
        name: 'ModerationError',
        categories: expect.arrayContaining(['moderation_service_error']),
      });

      expect(prisma.upsert).not.toHaveBeenCalled();
    });

    it('persists normally when moderation passes (lexical + mocked service clean)', async () => {
      const openai = makeMockOpenAI('Thank you so much for the kind words, Jane!');
      const prisma = makeMockPrisma();

      const moderationClient = {
        moderations: {
          create: vi.fn().mockResolvedValue({
            results: [{ flagged: false, categories: {} }],
          }),
        },
      };

      const result = await generateAndStoreReviewResponse(validInput, {
        openai: openai.client,
        prisma: prisma.client,
        moderationClient,
      });

      expect(moderationClient.moderations.create).toHaveBeenCalledTimes(1);
      expect(prisma.upsert).toHaveBeenCalledTimes(1);
      expect(result.content).toBe('Thank you so much for the kind words, Jane!');
    });

    it('supports injecting a custom moderate() function for deterministic tests', async () => {
      const openai = makeMockOpenAI('Anything at all.');
      const prisma = makeMockPrisma();
      const moderate = vi.fn().mockResolvedValue({
        flagged: true,
        categories: ['custom_rule'],
        reason: 'Custom rule triggered',
      });

      await expect(
        generateAndStoreReviewResponse(validInput, {
          openai: openai.client,
          prisma: prisma.client,
          moderate,
        }),
      ).rejects.toMatchObject({
        name: 'ModerationError',
        categories: ['custom_rule'],
      });

      expect(moderate).toHaveBeenCalledTimes(1);
      expect(prisma.upsert).not.toHaveBeenCalled();
    });
  });
});

describe('moderation module (unit)', () => {
  it('lexicalCheck passes clean content', async () => {
    const { lexicalCheck } = await import('@/lib/moderation');
    expect(lexicalCheck('Thanks for the lovely review!')).toEqual({
      flagged: false,
      categories: [],
      reason: null,
    });
  });

  it('lexicalCheck flags blocklisted terms case-insensitively', async () => {
    const { lexicalCheck } = await import('@/lib/moderation');
    const result = lexicalCheck('You should just KILL YOURSELF honestly.');
    expect(result.flagged).toBe(true);
    expect(result.categories).toContain('lexical_blocklist');
    // reason must not echo the matched term (PII/abuse-safe logging)
    expect(result.reason).not.toMatch(/kill yourself/i);
  });

  it('lexicalCheck flags forbidden refund promises', async () => {
    const { lexicalCheck } = await import('@/lib/moderation');
    expect(lexicalCheck('We offer a guaranteed refund always.').flagged).toBe(true);
  });

  it('moderateContent returns clean when no client is provided and text is clean', async () => {
    const { moderateContent } = await import('@/lib/moderation');
    const res = await moderateContent('Thanks for stopping by!');
    expect(res.flagged).toBe(false);
  });
});
