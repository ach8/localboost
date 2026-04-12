import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    review: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    business: {
      findUnique: vi.fn(),
    },
    reviewResponse: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/reviewService", () => ({
  generateReviewResponse: vi.fn(),
}));

import prisma from "@/lib/prisma";
import { generateReviewResponse } from "@/lib/reviewService";

// Import route handlers
import { GET, POST } from "@/app/api/reviews/route";
import { POST as GenerateResponsePOST } from "@/app/api/reviews/generate-response/route";

function createRequest(url, options = {}) {
  return new Request(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
}

describe("GET /api/reviews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 400 when businessId is missing", async () => {
    const request = createRequest("http://localhost/api/reviews");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("businessId");
  });

  it("should return reviews for a valid businessId", async () => {
    const mockReviews = [
      {
        id: "rev1",
        businessId: "biz1",
        authorName: "Jane",
        rating: 5,
        comment: "Great!",
        responses: [],
      },
    ];
    prisma.review.findMany.mockResolvedValue(mockReviews);

    const request = createRequest(
      "http://localhost/api/reviews?businessId=biz1",
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.reviews).toEqual(mockReviews);
    expect(prisma.review.findMany).toHaveBeenCalledWith({
      where: { businessId: "biz1" },
      include: { responses: true },
      orderBy: { createdAt: "desc" },
    });
  });
});

describe("POST /api/reviews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 400 when required fields are missing", async () => {
    const request = createRequest("http://localhost/api/reviews", {
      method: "POST",
      body: JSON.stringify({ businessId: "biz1" }),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("required");
  });

  it("should return 400 when rating is out of range", async () => {
    const request = createRequest("http://localhost/api/reviews", {
      method: "POST",
      body: JSON.stringify({
        businessId: "biz1",
        authorName: "Jane",
        rating: 6,
        comment: "Great!",
      }),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("rating");
  });

  it("should return 404 when business does not exist", async () => {
    prisma.business.findUnique.mockResolvedValue(null);

    const request = createRequest("http://localhost/api/reviews", {
      method: "POST",
      body: JSON.stringify({
        businessId: "nonexistent",
        authorName: "Jane",
        rating: 5,
        comment: "Great!",
      }),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("Business not found");
  });

  it("should create a review successfully", async () => {
    prisma.business.findUnique.mockResolvedValue({
      id: "biz1",
      name: "Joe's Diner",
    });
    const mockReview = {
      id: "rev1",
      businessId: "biz1",
      authorName: "Jane",
      rating: 5,
      comment: "Great food!",
      sourceUrl: null,
    };
    prisma.review.create.mockResolvedValue(mockReview);

    const request = createRequest("http://localhost/api/reviews", {
      method: "POST",
      body: JSON.stringify({
        businessId: "biz1",
        authorName: "Jane",
        rating: 5,
        comment: "Great food!",
      }),
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.review).toEqual(mockReview);
    expect(prisma.review.create).toHaveBeenCalledWith({
      data: {
        businessId: "biz1",
        authorName: "Jane",
        rating: 5,
        comment: "Great food!",
        sourceUrl: null,
      },
    });
  });
});

describe("POST /api/reviews/generate-response", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 400 when reviewId is missing", async () => {
    const request = createRequest(
      "http://localhost/api/reviews/generate-response",
      {
        method: "POST",
        body: JSON.stringify({}),
      },
    );
    const response = await GenerateResponsePOST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("reviewId");
  });

  it("should return 404 when review does not exist", async () => {
    prisma.review.findUnique.mockResolvedValue(null);

    const request = createRequest(
      "http://localhost/api/reviews/generate-response",
      {
        method: "POST",
        body: JSON.stringify({ reviewId: "nonexistent" }),
      },
    );
    const response = await GenerateResponsePOST(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("Review not found");
  });

  it("should generate and store a review response", async () => {
    const mockReview = {
      id: "rev1",
      authorName: "Jane",
      rating: 5,
      comment: "Amazing!",
      business: { id: "biz1", name: "Joe's Diner" },
    };
    prisma.review.findUnique.mockResolvedValue(mockReview);

    const aiResponse = "Thank you, Jane! We're glad you loved it.";
    generateReviewResponse.mockResolvedValue(aiResponse);

    const mockStored = {
      id: "resp1",
      reviewId: "rev1",
      body: aiResponse,
      tone: "professional",
    };
    prisma.reviewResponse.create.mockResolvedValue(mockStored);

    const request = createRequest(
      "http://localhost/api/reviews/generate-response",
      {
        method: "POST",
        body: JSON.stringify({ reviewId: "rev1", tone: "professional" }),
      },
    );
    const response = await GenerateResponsePOST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.response).toEqual(mockStored);

    expect(generateReviewResponse).toHaveBeenCalledWith({
      review: mockReview,
      businessName: "Joe's Diner",
      tone: "professional",
    });

    expect(prisma.reviewResponse.create).toHaveBeenCalledWith({
      data: {
        reviewId: "rev1",
        body: aiResponse,
        tone: "professional",
      },
    });
  });

  it("should default to professional tone for invalid tone values", async () => {
    const mockReview = {
      id: "rev1",
      authorName: "Bob",
      rating: 3,
      comment: "Okay experience.",
      business: { id: "biz1", name: "Salon Belle" },
    };
    prisma.review.findUnique.mockResolvedValue(mockReview);
    generateReviewResponse.mockResolvedValue("Thanks for your feedback.");
    prisma.reviewResponse.create.mockResolvedValue({
      id: "resp2",
      reviewId: "rev1",
      body: "Thanks for your feedback.",
      tone: "professional",
    });

    const request = createRequest(
      "http://localhost/api/reviews/generate-response",
      {
        method: "POST",
        body: JSON.stringify({ reviewId: "rev1", tone: "aggressive" }),
      },
    );
    await GenerateResponsePOST(request);

    expect(generateReviewResponse).toHaveBeenCalledWith(
      expect.objectContaining({ tone: "professional" }),
    );
  });
});
