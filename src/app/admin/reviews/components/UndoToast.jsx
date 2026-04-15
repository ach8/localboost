'use client';

/**
 * Stacked toast for the optimistic-delete grace window. One entry per pending
 * delete so an operator who removes several rows in quick succession can undo
 * each one independently.
 */
export default function UndoToast({ pending, error, onUndo, onDismissError }) {
  if (pending.length === 0 && !error) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6"
    >
      {error && (
        <div
          role="alert"
          className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 shadow-lg ring-1 ring-rose-900/5"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-rose-900">Couldn’t delete review</p>
            <p className="mt-0.5 break-words text-sm text-rose-800">{error}</p>
          </div>
          <button
            type="button"
            onClick={onDismissError}
            aria-label="Dismiss error"
            className="-mr-1 -mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-rose-700 transition hover:bg-rose-100"
          >
            ×
          </button>
        </div>
      )}

      {pending.map(({ id, label }) => (
        <div
          key={id}
          data-testid={`undo-toast-${id}`}
          className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 shadow-lg ring-1 ring-black/10"
        >
          <span
            aria-hidden
            className="h-3 w-3 animate-spin rounded-full border-2 border-slate-600 border-t-slate-200"
          />
          <p className="min-w-0 flex-1 truncate text-sm">
            Review {label ? `from ${label} ` : ''}deleted.
          </p>
          <button
            type="button"
            onClick={() => onUndo(id)}
            className="shrink-0 rounded-md bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white ring-1 ring-inset ring-slate-600 transition hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400"
          >
            Undo
          </button>
        </div>
      ))}
    </div>
  );
}
