import { describe, it, expect } from 'vitest';
import { ACTIONS, PHASES, cleanupReducer, initState } from '@/app/admin/maintenance/state';

describe('cleanupReducer', () => {
  const start = initState(30);

  it('initializes in idle with the default retention window', () => {
    expect(start).toEqual({ phase: 'idle', olderThanDays: 30, result: null, error: null });
  });

  it('SET_DAYS only updates the day count', () => {
    const next = cleanupReducer(start, { type: ACTIONS.SET_DAYS, days: 7 });
    expect(next.olderThanDays).toBe(7);
    expect(next.phase).toBe(PHASES.IDLE);
  });

  it('REQUEST_CONFIRM transitions idle → confirming and clears prior banners', () => {
    const dirty = { ...start, phase: PHASES.ERROR, error: 'prev', result: { deletedCount: 1 } };
    const next = cleanupReducer(dirty, { type: ACTIONS.REQUEST_CONFIRM });
    expect(next.phase).toBe(PHASES.CONFIRMING);
    expect(next.error).toBeNull();
    expect(next.result).toBeNull();
  });

  it('REQUEST_CONFIRM is a no-op while submitting (prevents re-arming mid-flight)', () => {
    const midFlight = { ...start, phase: PHASES.SUBMITTING };
    expect(cleanupReducer(midFlight, { type: ACTIONS.REQUEST_CONFIRM })).toBe(midFlight);
  });

  it('CANCEL_CONFIRM returns to idle only from confirming', () => {
    const confirming = { ...start, phase: PHASES.CONFIRMING };
    expect(cleanupReducer(confirming, { type: ACTIONS.CANCEL_CONFIRM }).phase).toBe(PHASES.IDLE);

    const submitting = { ...start, phase: PHASES.SUBMITTING };
    expect(cleanupReducer(submitting, { type: ACTIONS.CANCEL_CONFIRM })).toBe(submitting);
  });

  it('SUBMIT_START requires confirming phase', () => {
    const confirming = { ...start, phase: PHASES.CONFIRMING };
    expect(cleanupReducer(confirming, { type: ACTIONS.SUBMIT_START }).phase).toBe(
      PHASES.SUBMITTING,
    );
    expect(cleanupReducer(start, { type: ACTIONS.SUBMIT_START })).toBe(start);
  });

  it('SUBMIT_SUCCESS captures the result and clears error', () => {
    const data = { deletedCount: 4, cutoff: 'x', olderThanDays: 30 };
    const next = cleanupReducer(
      { ...start, phase: PHASES.SUBMITTING, error: 'stale' },
      { type: ACTIONS.SUBMIT_SUCCESS, data },
    );
    expect(next).toEqual({ phase: PHASES.SUCCESS, olderThanDays: 30, result: data, error: null });
  });

  it('SUBMIT_ERROR captures the error and clears result', () => {
    const next = cleanupReducer(
      { ...start, phase: PHASES.SUBMITTING, result: { deletedCount: 1 } },
      { type: ACTIONS.SUBMIT_ERROR, message: 'nope' },
    );
    expect(next.phase).toBe(PHASES.ERROR);
    expect(next.error).toBe('nope');
    expect(next.result).toBeNull();
  });

  it('DISMISS_RESULT clears both banners and returns to idle', () => {
    const errored = { ...start, phase: PHASES.ERROR, error: 'e' };
    expect(cleanupReducer(errored, { type: ACTIONS.DISMISS_RESULT })).toEqual({
      phase: PHASES.IDLE,
      olderThanDays: 30,
      result: null,
      error: null,
    });
  });
});
