import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateReviewResponse } from "@/lib/reviewService";

vi.mock("@/lib/openai", () => ({
  getOpenAIClient: vi.fn(),
}));

import { getOpenAIClient } from "@/lib/openai";

function createMockOpenAI(responseText) {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: responseText } }],
        }),
      },
    },
  };
}

describe("generateReviewResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should generate a response for a positive review", async () => {
    const mockResponse =
      "Thank you so much, Jane! We're thrilled you enjoyed your visit.";
    const mockOpenAI = createMockOpenAI(mockResponse);
    getOpenAIClient.mockReturnValue(mockOpenAI);

    const result = await generateReviewResponse({
      review: {
        authorName: "Jane Doe",
        rating: 5,
        comment: "Amazing food and great service!",
      },
      businessName: "Joe's Diner",
      tone: "professional",
    });

    expect(result).toBe(mockResponse);
    expect(mockOpenAI.chat.completions.create).toHaveBeenCalledOnce();

    const callArgs = mockOpenAI.chat.completions.create.mock.calls[0][0];
    expect(callArgs.model).toBe("gpt-4o-mini");
    expect(callArgs.messages[0].content).toContain("Jane Doe");
    expect(callArgs.messages[0].content).toContain("Joe's Diner");
    expect(callArgs.messages[0].content).toContain(
      "Amazing food and great service!",
    );
    expect(callArgs.messages[0].content).toContain("5/5");
  });

  it("should generate a response for a negative review", async () => {
    const mockResponse =
      "We're sorry to hear about your experience, Bob. We'd love to make it right.";
    const mockOpenAI = createMockOpenAI(mockResponse);
    getOpenAIClient.mockReturnValue(mockOpenAI);

    const result = await generateReviewResponse({
      review: {
        authorName: "Bob Smith",
        rating: 1,
        comment: "Terrible experience, waited an hour for cold food.",
      },
      businessName: "Joe's Diner",
      tone: "empathetic",
    });

    expect(result).toBe(mockResponse);

    const callArgs = mockOpenAI.chat.completions.create.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContain("Bob Smith");
    expect(callArgs.messages[0].content).toContain("1/5");
    expect(callArgs.messages[0].content).toContain("empathy");
  });

  it("should use professional tone by default", async () => {
    const mockOpenAI = createMockOpenAI("Thank you for your feedback.");
    getOpenAIClient.mockReturnValue(mockOpenAI);

    await generateReviewResponse({
      review: { authorName: "Alice", rating: 3, comment: "It was okay." },
      businessName: "Salon Belle",
    });

    const callArgs = mockOpenAI.chat.completions.create.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContain("professional");
  });

  it("should use friendly tone when specified", async () => {
    const mockOpenAI = createMockOpenAI("Hey thanks!");
    getOpenAIClient.mockReturnValue(mockOpenAI);

    await generateReviewResponse({
      review: { authorName: "Alice", rating: 4, comment: "Nice place!" },
      businessName: "Salon Belle",
      tone: "friendly",
    });

    const callArgs = mockOpenAI.chat.completions.create.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContain("warm, friendly");
  });

  it("should throw an error when OpenAI returns empty response", async () => {
    const mockOpenAI = createMockOpenAI("");
    getOpenAIClient.mockReturnValue(mockOpenAI);

    await expect(
      generateReviewResponse({
        review: { authorName: "Test", rating: 3, comment: "Test review" },
        businessName: "Test Biz",
      }),
    ).rejects.toThrow("OpenAI returned an empty response");
  });

  it("should pass correct parameters to OpenAI", async () => {
    const mockOpenAI = createMockOpenAI("Great response.");
    getOpenAIClient.mockReturnValue(mockOpenAI);

    await generateReviewResponse({
      review: { authorName: "User", rating: 4, comment: "Good" },
      businessName: "My Shop",
    });

    const callArgs = mockOpenAI.chat.completions.create.mock.calls[0][0];
    expect(callArgs.max_tokens).toBe(256);
    expect(callArgs.temperature).toBe(0.7);
    expect(callArgs.messages).toHaveLength(1);
    expect(callArgs.messages[0].role).toBe("user");
  });
});
