/**
 * State machine for the ReviewJob cleanup panel.
 *
 * Phases:
 *   idle        — form visible, no result shown
 *   confirming  — typed-confirmation modal open; no destructive call yet
 *   submitting  — server action in flight; modal kept open with spinner
 *   success     — terminal success; result banner shown
 *   error       — terminal failure; error banner shown
 *
 * Centralising transitions in a reducer keeps each subcomponent presentational
 * and makes new flows (e.g. scheduled cleanups, audit logs) straightforward to
 * add without reshaping every `useState` tuple.
 */

export const PHASES = Object.freeze({
  IDLE: 'idle',
  CONFIRMING: 'confirming',
  SUBMITTING: 'submitting',
  SUCCESS: 'success',
  ERROR: 'error',
});

export const ACTIONS = Object.freeze({
  SET_DAYS: 'SET_DAYS',
  REQUEST_CONFIRM: 'REQUEST_CONFIRM',
  CANCEL_CONFIRM: 'CANCEL_CONFIRM',
  SUBMIT_START: 'SUBMIT_START',
  SUBMIT_SUCCESS: 'SUBMIT_SUCCESS',
  SUBMIT_ERROR: 'SUBMIT_ERROR',
  DISMISS_RESULT: 'DISMISS_RESULT',
});

export function initState(defaultDays) {
  return {
    phase: PHASES.IDLE,
    olderThanDays: defaultDays,
    result: null,
    error: null,
  };
}

export function cleanupReducer(state, action) {
  switch (action.type) {
    case ACTIONS.SET_DAYS:
      return { ...state, olderThanDays: action.days };

    case ACTIONS.REQUEST_CONFIRM:
      // Only arm confirmation from non-terminal phases. Clear any prior
      // error so it doesn't shadow the new attempt.
      if (state.phase === PHASES.SUBMITTING || state.phase === PHASES.CONFIRMING) {
        return state;
      }
      return { ...state, phase: PHASES.CONFIRMING, error: null, result: null };

    case ACTIONS.CANCEL_CONFIRM:
      if (state.phase !== PHASES.CONFIRMING) return state;
      return { ...state, phase: PHASES.IDLE };

    case ACTIONS.SUBMIT_START:
      if (state.phase !== PHASES.CONFIRMING) return state;
      return { ...state, phase: PHASES.SUBMITTING, error: null };

    case ACTIONS.SUBMIT_SUCCESS:
      return { ...state, phase: PHASES.SUCCESS, result: action.data, error: null };

    case ACTIONS.SUBMIT_ERROR:
      return { ...state, phase: PHASES.ERROR, result: null, error: action.message };

    case ACTIONS.DISMISS_RESULT:
      return { ...state, phase: PHASES.IDLE, result: null, error: null };

    default:
      return state;
  }
}
