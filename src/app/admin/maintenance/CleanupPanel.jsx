'use client';

import { useCallback, useReducer } from 'react';
import { DEFAULT_RETENTION_DAYS } from '@/lib/reviewJobCleanup.constants';
import { runReviewJobCleanup } from './actions';
import { ACTIONS, PHASES, cleanupReducer, initState } from './state';
import CleanupForm from './components/CleanupForm';
import ConfirmDialog from './components/ConfirmDialog';
import ResultBanner from './components/ResultBanner';

/**
 * Orchestrates the cleanup flow: form ⟶ confirmation ⟶ server action ⟶ banner.
 * Owns the reducer; each subcomponent is presentational and receives only the
 * slice of state + callbacks it needs.
 */
export default function CleanupPanel() {
  const [state, dispatch] = useReducer(cleanupReducer, DEFAULT_RETENTION_DAYS, initState);

  const handleDaysChange = useCallback((days) => dispatch({ type: ACTIONS.SET_DAYS, days }), []);

  const handleRunClick = useCallback(() => dispatch({ type: ACTIONS.REQUEST_CONFIRM }), []);
  const handleCancel = useCallback(() => dispatch({ type: ACTIONS.CANCEL_CONFIRM }), []);
  const handleDismiss = useCallback(() => dispatch({ type: ACTIONS.DISMISS_RESULT }), []);

  const handleConfirm = useCallback(async () => {
    dispatch({ type: ACTIONS.SUBMIT_START });
    try {
      const response = await runReviewJobCleanup({ olderThanDays: state.olderThanDays });
      if (response?.ok) {
        dispatch({ type: ACTIONS.SUBMIT_SUCCESS, data: response.data });
      } else {
        dispatch({
          type: ACTIONS.SUBMIT_ERROR,
          message: response?.error ?? 'Cleanup failed. Please try again.',
        });
      }
    } catch {
      dispatch({
        type: ACTIONS.SUBMIT_ERROR,
        message: 'Unable to reach the server. Please try again.',
      });
    }
  }, [state.olderThanDays]);

  const formDisabled = state.phase === PHASES.CONFIRMING || state.phase === PHASES.SUBMITTING;
  const dialogOpen = state.phase === PHASES.CONFIRMING || state.phase === PHASES.SUBMITTING;

  return (
    <section
      aria-labelledby="cleanup-heading"
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-900/5"
    >
      <PanelHeader />

      <CleanupForm
        olderThanDays={state.olderThanDays}
        onDaysChange={handleDaysChange}
        onRunClick={handleRunClick}
        disabled={formDisabled}
      />

      <ResultBanner
        phase={state.phase}
        result={state.result}
        error={state.error}
        onDismiss={handleDismiss}
      />

      <ConfirmDialog
        open={dialogOpen}
        olderThanDays={state.olderThanDays}
        submitting={state.phase === PHASES.SUBMITTING}
        onCancel={handleCancel}
        onConfirm={handleConfirm}
      />
    </section>
  );
}

function PanelHeader() {
  return (
    <div className="border-b border-slate-100 bg-gradient-to-r from-white to-slate-50 px-6 py-5 sm:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="cleanup-heading" className="text-lg font-semibold tracking-tight text-slate-900">
            Review Job Cleanup
          </h2>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-600">
            Permanently deletes{' '}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">
              ReviewJob
            </code>{' '}
            rows in <span className="font-medium text-slate-800">COMPLETED</span> or{' '}
            <span className="font-medium text-slate-800">FAILED</span> state that are older than the
            selected retention window. In-flight jobs are never affected.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          Destructive
        </span>
      </div>
    </div>
  );
}
