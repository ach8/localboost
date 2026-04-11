# LocalBoost — AI-Powered Platform for Local Businesses

## Project Overview
LocalBoost is a Full-Stack JavaScript SaaS platform built to help local businesses (restaurants, salons, clinics, etc.) manage their online reputation, automate customer communication, and boost revenue through AI-powered tools.

## Architecture
- **Framework**: Next.js 14+ (App Router)
- **Language**: JavaScript (ES6+)
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL) + Prisma ORM
- **AI**: OpenAI API for generating review responses, AI receptionist, etc.

## Development Rules

### Git Workflow
- Always create a feature branch before making changes. Never commit directly to `main`.
- Branch naming convention: `feat/<feature-name>`, `fix/<bug-name>`, `refactor/<scope>`
- Write meaningful commit messages following Conventional Commits format.
- Do NOT force push or use `--no-verify` under any circumstances.
- Do NOT amend commits that have already been pushed.

### Next.js & JavaScript Conventions
- Use the Next.js App Router (`src/app/`). Do not use the `pages/` directory.
- All API routes must be implemented elegantly inside `src/app/api/`. 
- Use Server Actions (`"use server"`) where appropriate, but never place business logic directly inside React components.
- Components must be functional components with hooks.
- Extensively use modern ES6+ features (destructuring, async/await).
- Environment variables must be validated dynamically before usage, not scattered raw `process.env` calls throughout components.
- Prisma schemas go in `prisma/schema.prisma`.

### Styling
- Use Tailwind CSS utility classes exclusively. Avoid writing custom CSS unless absolutely necessary.
- Follow mobile-first design principles.

### Testing
- Use Vitest and React Testing Library. Tests go in `src/__tests__/`.
- External API calls (OpenAI, Twilio, Google, Stripe) must ALWAYS be mocked in tests. Never make real API calls during test suite execution.
- Run `npm run test` before considering any feature task complete.

### Security
- Never log or print API keys, tokens, or passwords to the console.
- Never commit `.env` or `.env.local` files. Use `.env.example` with placeholder values.
- All user-facing inputs must be sanitized. Server-side validation is mandatory for all mutations.

### Code Quality
- Run `npx eslint .` and `npx prettier --check .` before committing changes.
- Do not disable linter rules inline unless absolutely necessary, and always add an explanatory comment if you do.

### Communication & Agentic Behavior
- If a task involves deleting files, dropping database tables, applying unsafe Prisma migrations, or modifying shared configuration, ask for explicit confirmation before proceeding.
- If requirements are ambiguous, ask clarifying questions rather than making assumptions about the business logic.
- After completing a task, provide a summary of what was done and which tests were executed.
