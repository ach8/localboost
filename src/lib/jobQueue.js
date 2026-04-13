/**
 * Minimal in-memory job queue.
 *
 * Authoritative job state lives in the database (ReviewJob model).
 * This module only handles deferred execution so the HTTP response
 * flushes before the worker starts. Designed to be replaced by
 * Redis/BullMQ later — callers depend only on the `enqueue` signature.
 */

const jobs = new Map();

const defer =
  typeof setImmediate === 'function'
    ? setImmediate
    : (fn) => setTimeout(fn, 0);

/**
 * Enqueue a background job.
 *
 * @param {string} jobId
 * @param {() => Promise<void>} workerFn — closure over everything needed
 */
export function enqueue(jobId, workerFn) {
  if (jobs.has(jobId)) {
    throw new Error(`Job ${jobId} is already enqueued`);
  }

  const entry = { jobId, status: 'running', startedAt: Date.now() };
  jobs.set(jobId, entry);

  defer(async () => {
    try {
      await workerFn();
      entry.status = 'done';
    } catch (err) {
      entry.status = 'error';
      entry.error = err;
    } finally {
      // Auto-evict after 60 s — the DB is the source of truth.
      setTimeout(() => jobs.delete(jobId), 60_000);
    }
  });
}

/** Test-only: inspect an in-memory entry. */
export function __getJobEntry(jobId) {
  return jobs.get(jobId) ?? null;
}

/** Test-only: clear all entries. */
export function __clearAll() {
  jobs.clear();
}
