'use client';

import { PHASES } from '../state';

export default function ResultBanner({ phase, result, error, onDismiss }) {
  if (phase === PHASES.SUCCESS && result) {
    const { deletedCount = 0, cutoff, olderThanDays } = result;
    return (
      <div
        role="status"
        className="mx-6 mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 sm:mx-8"
      >
        <div className="flex items-start gap-3">
          <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-emerald-900">Cleanup complete</p>
            <p className="mt-1 text-sm text-emerald-800">
              Deleted{' '}
              <span className="font-semibold tabular-nums" data-testid="deleted-count">
                {deletedCount}
              </span>{' '}
              {deletedCount === 1 ? 'record' : 'records'} older than{' '}
              <span className="font-semibold">{olderThanDays}</span>{' '}
              {olderThanDays === 1 ? 'day' : 'days'}.
            </p>
            {cutoff && (
              <p className="mt-1 text-xs text-emerald-700/80">
                Cutoff timestamp: <code className="font-mono">{cutoff}</code>
              </p>
            )}
          </div>
          <DismissButton onClick={onDismiss} tone="emerald" />
        </div>
      </div>
    );
  }

  if (phase === PHASES.ERROR && error) {
    return (
      <div
        role="alert"
        className="mx-6 mb-6 rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 sm:mx-8"
      >
        <div className="flex items-start gap-3">
          <AlertIcon className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-rose-900">Cleanup failed</p>
            <p className="mt-1 break-words text-sm text-rose-800">{error}</p>
          </div>
          <DismissButton onClick={onDismiss} tone="rose" />
        </div>
      </div>
    );
  }

  return null;
}

function DismissButton({ onClick, tone }) {
  const toneClasses =
    tone === 'emerald'
      ? 'text-emerald-700 hover:bg-emerald-100 focus-visible:outline-emerald-500'
      : 'text-rose-700 hover:bg-rose-100 focus-visible:outline-rose-500';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Dismiss"
      className={`-mr-1.5 -mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${toneClasses}`}
    >
      <XIcon className="h-4 w-4" />
    </button>
  );
}

function CheckIcon({ className }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={className}>
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function AlertIcon({ className }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={className}>
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 9.5a1 1 0 100-2 1 1 0 000 2z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function XIcon({ className }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  );
}
