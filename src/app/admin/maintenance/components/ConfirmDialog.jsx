'use client';

import { useEffect, useRef, useState } from 'react';

export const CONFIRM_PHRASE = 'DELETE';

/**
 * Modal confirmation for destructive cleanup. Guards against accidental
 * clicks with a typed-phrase check; the primary button only becomes
 * actionable once the operator types `DELETE` exactly.
 *
 * Escape and backdrop-click both cancel, but only while not submitting —
 * we never strand an in-flight request.
 */
export default function ConfirmDialog({ open, olderThanDays, submitting, onCancel, onConfirm }) {
  const [typed, setTyped] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) setTyped('');
  }, [open]);

  useEffect(() => {
    if (open) {
      // Defer so the modal is mounted before focusing.
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(event) {
      if (event.key === 'Escape' && !submitting) onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, submitting, onCancel]);

  if (!open) return null;

  const canConfirm = typed.trim().toUpperCase() === CONFIRM_PHRASE && !submitting;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-cleanup-title"
      aria-describedby="confirm-cleanup-description"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 backdrop-blur-sm sm:items-center"
      onClick={(event) => {
        if (event.target === event.currentTarget && !submitting) onCancel();
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-900/10">
        <div className="px-6 pb-5 pt-6 sm:px-7">
          <div className="flex items-start gap-4">
            <div
              aria-hidden
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100"
            >
              <WarningIcon className="h-5 w-5 text-rose-600" />
            </div>
            <div className="flex-1">
              <h3
                id="confirm-cleanup-title"
                className="text-base font-semibold tracking-tight text-slate-900"
              >
                Confirm destructive cleanup
              </h3>
              <p
                id="confirm-cleanup-description"
                className="mt-2 text-sm leading-relaxed text-slate-600"
              >
                This will permanently delete every{' '}
                <span className="font-medium text-slate-800">COMPLETED</span> and{' '}
                <span className="font-medium text-slate-800">FAILED</span>{' '}
                <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs text-slate-700">
                  ReviewJob
                </code>{' '}
                older than{' '}
                <span className="font-semibold text-slate-900">
                  {olderThanDays} {olderThanDays === 1 ? 'day' : 'days'}
                </span>
                . This action cannot be undone.
              </p>
            </div>
          </div>

          <label
            htmlFor="confirm-cleanup-input"
            className="mt-6 block text-sm font-medium text-slate-800"
          >
            Type{' '}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800">
              {CONFIRM_PHRASE}
            </code>{' '}
            to confirm
          </label>
          <input
            ref={inputRef}
            id="confirm-cleanup-input"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            disabled={submitting}
            className="mt-2 block w-full rounded-lg border-0 bg-slate-50 px-3.5 py-2.5 font-mono text-sm tracking-wider text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4 sm:flex-row sm:justify-end sm:px-7">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="inline-flex justify-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
          >
            {submitting && (
              <span
                aria-hidden
                className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
              />
            )}
            {submitting ? 'Deleting…' : 'Delete records'}
          </button>
        </div>
      </div>
    </div>
  );
}

function WarningIcon({ className }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={className}>
      <path
        fillRule="evenodd"
        d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
        clipRule="evenodd"
      />
    </svg>
  );
}
