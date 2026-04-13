import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { enqueue, __getJobEntry, __clearAll } from '@/lib/jobQueue';

describe('enqueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __clearAll();
  });

  afterEach(() => {
    vi.useRealTimers();
    __clearAll();
  });

  it('calls the worker function asynchronously, not synchronously', async () => {
    const worker = vi.fn().mockResolvedValue(undefined);

    enqueue('job_1', worker);

    // Worker should NOT have been called yet (deferred via setImmediate).
    expect(worker).not.toHaveBeenCalled();

    // Flush only the deferred callback (not the 60 s cleanup).
    await vi.advanceTimersByTimeAsync(1);

    expect(worker).toHaveBeenCalledTimes(1);
  });

  it('throws if the same jobId is enqueued twice', () => {
    enqueue('dup_1', vi.fn().mockResolvedValue(undefined));

    expect(() => enqueue('dup_1', vi.fn())).toThrow(/already enqueued/i);
  });

  it('sets status to done after worker resolves', async () => {
    enqueue('ok_1', vi.fn().mockResolvedValue(undefined));

    await vi.advanceTimersByTimeAsync(1);

    expect(__getJobEntry('ok_1')).not.toBeNull();
    expect(__getJobEntry('ok_1').status).toBe('done');
  });

  it('sets status to error after worker rejects', async () => {
    enqueue('fail_1', vi.fn().mockRejectedValue(new Error('boom')));

    await vi.advanceTimersByTimeAsync(1);

    const entry = __getJobEntry('fail_1');
    expect(entry).not.toBeNull();
    expect(entry.status).toBe('error');
    expect(entry.error).toBeInstanceOf(Error);
  });

  it('auto-evicts the entry after 60 seconds', async () => {
    enqueue('evict_1', vi.fn().mockResolvedValue(undefined));

    // Flush the deferred worker only.
    await vi.advanceTimersByTimeAsync(1);
    expect(__getJobEntry('evict_1')).not.toBeNull();

    // Advance past the 60 s cleanup timeout.
    await vi.advanceTimersByTimeAsync(61_000);
    expect(__getJobEntry('evict_1')).toBeNull();
  });
});
