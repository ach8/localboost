import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const businessId = searchParams.get("businessId");

  if (!businessId) {
    return NextResponse.json(
      { error: "businessId query parameter is required" },
      { status: 400 },
    );
  }

  const reviews = await prisma.review.findMany({
    where: { businessId },
    include: { responses: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ reviews });
}

export async function POST(request) {
  const body = await request.json();
  const { businessId, authorName, rating, comment, sourceUrl } = body;

  if (!businessId || !authorName || rating == null || !comment) {
    return NextResponse.json(
      { error: "businessId, authorName, rating, and comment are required" },
      { status: 400 },
    );
  }

  if (typeof rating !== "number" || rating < 1 || rating > 5) {
    return NextResponse.json(
      { error: "rating must be a number between 1 and 5" },
      { status: 400 },
    );
  }

  const business = await prisma.business.findUnique({
    where: { id: businessId },
  });

  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  const review = await prisma.review.create({
    data: {
      businessId,
      authorName,
      rating,
      comment,
      sourceUrl: sourceUrl || null,
    },
  });

  return NextResponse.json({ review }, { status: 201 });
}
