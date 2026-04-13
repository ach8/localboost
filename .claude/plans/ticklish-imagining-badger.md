# Plan: Async Review Response Generation

## Context

The current POST `/api/reviews/respond` endpoint runs OpenAI generation + moderation + DB save synchronously, which is too slow and risks HTTP timeouts. The endpoint needs to return immediately (HTTP 202 + jobId) and process in the background. Job status must live in the database so the frontend can poll reliably even if the Next.js process restarts.

## Proposed Database Schema Change

A new `ReviewJob` model and `JobStatus` enum in `prisma/schema.prisma`:

```prisma
enum JobStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}

model ReviewJob {
  id             String    @id @default(cuid())
  reviewId       String
  status         JobStatus @default(PENDING)
  errorMessage   String?
  inputPayload   Json      // Full validated input so worker is self-contained
  responseId     String?   @unique  // Links to ReviewResponse on completion
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
}
```

Key decisions:
- `inputPayload` as JSON so the worker reads everything from the DB row (no shared memory dependency — ready for Redis later)
- `reviewId` is NOT unique — allows retries for the same review
- No FK to `GoogleReview` — matches existing pattern where `reviewId` is a plain string identifier

## Implementation

### 1. New module: `src/lib/jobQueue.js`
Minimal in-memory queue with `enqueue(jobId, workerFn)`. Uses `setImmediate` to defer work after the HTTP response flushes. Entries auto-evict after 60s (authoritative state is in the DB). Fully replaceable by Redis/BullMQ later — callers only depend on the `enqueue` signature.

### 2. New module: `src/lib/reviewJobWorker.js`
`executeReviewJob(jobId, deps)`:
- Reads job from DB, marks PROCESSING
- Calls existing `generateAndStoreReviewResponse(job.inputPayload, deps)`
- Marks COMPLETED (with `responseId`) or FAILED (with safe error message — no secret leakage)
- All deps injectable for testing

### 3. Modified: `src/lib/reviewResponses.js`
One change: export `reviewInputSchema` so the route can validate before creating the job record. The function itself is unchanged.

### 4. Rewritten: `src/app/api/reviews/respond/route.js`
```
POST → validate input → create ReviewJob (PENDING) → enqueue worker → return 202 { jobId, status }
```
Handles validation errors (400) and DB errors (500). No longer calls `generateAndStoreReviewResponse` synchronously.

### 5. New route: `src/app/api/reviews/respond/status/[jobId]/route.js`
GET endpoint for polling. Returns `{ jobId, status, reviewId, createdAt, updatedAt }` plus `errorMessage` (FAILED) or `responseId` (COMPLETED). Does NOT expose `inputPayload`.

### 6. Tests
- `src/__tests__/reviewJobWorker.test.js` — worker marks PROCESSING→COMPLETED/FAILED, safe error messages, ModerationError handling
- `src/__tests__/jobQueue.test.js` — async execution, duplicate rejection, cleanup
- Existing `reviewResponses.test.js` — unchanged, still valid
- All mocked (no real API/DB calls)

## File changes summary

| File | Action |
|------|--------|
| `prisma/schema.prisma` | Add `JobStatus` enum + `ReviewJob` model |
| `src/lib/reviewResponses.js` | Export `reviewInputSchema` |
| `src/lib/jobQueue.js` | **New** — in-memory queue |
| `src/lib/reviewJobWorker.js` | **New** — background worker |
| `src/app/api/reviews/respond/route.js` | Rewrite to async 202 pattern |
| `src/app/api/reviews/respond/status/[jobId]/route.js` | **New** — polling endpoint |
| `src/__tests__/reviewJobWorker.test.js` | **New** |
| `src/__tests__/jobQueue.test.js` | **New** |

## Verification
1. `npx prisma migrate dev --name add-review-job-model`
2. `npm run test` — all tests pass
