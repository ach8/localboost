# LocalBoost

AI-powered platform for local businesses to manage their online reputation, automate customer communication, and boost revenue.

## Features (Planned)
- **Review Management**: Automatically collect and respond to Google reviews
- **AI Receptionist**: 24/7 phone/chat answering and appointment booking
- **Chat Widget**: Embeddable AI chatbot trained on business data
- **Analytics Dashboard**: Track reviews, calls, appointments, and trends
- **Automated Campaigns**: SMS/email campaigns for promotions and reminders

## Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Language**: JavaScript
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL) + Prisma
- **AI**: OpenAI API

## Getting Started
To get started with the project, ensure you use modern Node.js and have basic familiarity with Next.js App Router conventions.

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
# then fill in DATABASE_URL, OPENAI_API_KEY, etc.

# 3. Generate Prisma client and run migrations
npx prisma generate
npx prisma migrate dev

# 4. Run the dev server
npm run dev

# 5. Run the test suite
npm run test
```

## Project Layout
- `src/app/` — Next.js App Router pages, layouts, and API routes
- `src/app/api/reviews/respond/` — POST endpoint that generates + stores AI responses to Google reviews
- `src/lib/` — shared server-side libraries (Prisma client, OpenAI client, env validation, business logic)
- `src/__tests__/` — Vitest test suites (external APIs are always mocked)
- `prisma/schema.prisma` — database schema (Business, GoogleReview, ReviewResponse)
