import { getOpenAIClient } from "./openai";

const TONE_INSTRUCTIONS = {
  professional:
    "Respond in a professional and courteous tone suitable for a business owner.",
  friendly: "Respond in a warm, friendly, and approachable tone.",
  empathetic:
    "Respond with empathy and understanding, acknowledging the customer's feelings.",
};

export async function generateReviewResponse({
  review,
  businessName,
  tone = "professional",
}) {
  const { authorName, rating, comment } = review;

  const toneInstruction =
    TONE_INSTRUCTIONS[tone] || TONE_INSTRUCTIONS.professional;

  const prompt = `You are an AI assistant helping a local business called "${businessName}" respond to a Google Customer Review.

${toneInstruction}

The response should:
- Thank the customer by name if appropriate
- Address specific points from their review
- Be concise (2-4 sentences)
- If the review is negative (rating <= 2), apologize and offer to make things right
- If the review is positive (rating >= 4), express gratitude and invite them back
- Never be defensive or argumentative

Customer Review:
- Author: ${authorName}
- Rating: ${rating}/5
- Comment: "${comment}"

Write a response from the business owner:`;

  const openai = getOpenAIClient();

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 256,
    temperature: 0.7,
  });

  const responseText = completion.choices[0]?.message?.content?.trim();

  if (!responseText) {
    throw new Error("OpenAI returned an empty response");
  }

  return responseText;
}
