import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateReviewResponse } from "@/lib/reviewService";

export async function POST(request) {
  const body = await request.json();
  const { reviewId, tone } = body;

  if (!reviewId) {
    return NextResponse.json(
      { error: "reviewId is required" },
      { status: 400 },
    );
  }

  const validTones = ["professional", "friendly", "empathetic"];
  const selectedTone = validTones.includes(tone) ? tone : "professional";

  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    include: { business: true },
  });

  if (!review) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  const responseText = await generateReviewResponse({
    review,
    businessName: review.business.name,
    tone: selectedTone,
  });

  const reviewResponse = await prisma.reviewResponse.create({
    data: {
      reviewId,
      body: responseText,
      tone: selectedTone,
    },
  });

  return NextResponse.json({ response: reviewResponse }, { status: 201 });
}
