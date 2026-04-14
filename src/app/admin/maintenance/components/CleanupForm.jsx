'use client';

import {
  DEFAULT_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  MAX_RETENTION_DAYS,
} from '@/lib/reviewJobCleanup.constants';

export default function CleanupForm({ olderThanDays, onDaysChange, onRunClick, disabled }) {
  const invalid =
    !Number.isInteger(olderThanDays) ||
    olderThanDays < MIN_RETENTION_DAYS ||
    olderThanDays > MAX_RETENTION_DAYS;

  return (
    <div className="px-6 py-6 sm:px-8 sm:py-8">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
          <h3 className="text-sm font-semibold text-slate-900">Retention window</h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            Choose how many days of completed and failed job history to keep. Records older than
            this are eligible for deletion.
          </p>
        </div>

        <div>
          <label htmlFor="older-than-days" className="block text-sm font-medium text-slate-800">
            Older than (days)
          </label>
          <input
            id="older-than-days"
            type="number"
            inputMode="numeric"
            min={MIN_RETENTION_DAYS}
            max={MAX_RETENTION_DAYS}
            step={1}
            value={Number.isFinite(olderThanDays) ? olderThanDays : ''}
            onChange={(e) => onDaysChange(e.target.valueAsNumber)}
            aria-invalid={invalid || undefined}
            className="mt-2 block w-full rounded-lg border-0 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 aria-[invalid=true]:ring-rose-400"
          />
          <p className="mt-2 text-xs text-slate-500">
            {MIN_RETENTION_DAYS}–{MAX_RETENTION_DAYS}. Default {DEFAULT_RETENTION_DAYS}.
          </p>
        </div>
      </div>

      <div className="mt-8 flex flex-col-reverse gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">
          A confirmation step is required before any records are deleted.
        </p>
        <button
          type="button"
          onClick={onRunClick}
          disabled={disabled || invalid}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
        >
          Run cleanup
        </button>
      </div>
    </div>
  );
}
