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
- **Database**: Supabase (PostgreSQL) + Prisma ORM
- **AI**: OpenAI API
- **Testing**: Vitest + React Testing Library

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy the environment file and fill in your values:
   ```bash
   cp .env.example .env
   ```

3. Generate the Prisma client:
   ```bash
   npx prisma generate
   ```

4. Run database migrations:
   ```bash
   npx prisma migrate dev
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```

## API Endpoints

### Reviews
- `GET /api/reviews?businessId=<id>` — List reviews for a business (includes AI responses)
- `POST /api/reviews` — Create a new review
- `POST /api/reviews/generate-response` — Generate an AI response for a review

## Testing

```bash
npm run test
```

All external API calls (OpenAI) are mocked in the test suite.
