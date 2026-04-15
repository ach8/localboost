'use client';

import { useState } from 'react';
import { REVIEW_SORT_FIELDS, REVIEW_SOURCES, REVIEW_SEARCH_DEFAULTS } from '../searchParams';

const SORT_LABELS = {
  postedAt: 'Date posted',
  rating: 'Star rating',
  createdAt: 'Date imported',
};

/**
 * Presentational filter bar. Navigation + pending state are owned by
 * `ReviewPanel`; every control reports changes via `onNavigate(patch)` so the
 * URL remains the single source of truth. Only the free-text search box is
 * buffered locally (to avoid a DB round-trip per keystroke).
 */
export default function ReviewFilters({ state, total, isPending, onNavigate, onReset }) {
  const [draftQuery, setDraftQuery] = useState(state.q);

  const isFiltered =
    state.rating !== REVIEW_SEARCH_DEFAULTS.rating ||
    state.source !== REVIEW_SEARCH_DEFAULTS.source ||
    state.from !== REVIEW_SEARCH_DEFAULTS.from ||
    state.to !== REVIEW_SEARCH_DEFAULTS.to ||
    state.q !== REVIEW_SEARCH_DEFAULTS.q;

  const rangeInvalid = state.from && state.to && state.from > state.to;

  return (
    <div className="border-b border-slate-100 bg-gradient-to-r from-white to-slate-50 px-6 py-5 sm:px-8">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end gap-4">
          <FieldShell id="filter-rating" label="Star rating">
            <select
              id="filter-rating"
              value={state.rating ?? ''}
              onChange={(e) =>
                onNavigate({ rating: e.target.value === '' ? null : Number(e.target.value) })
              }
              className={selectClasses}
            >
              <option value="">Any rating</option>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {'★'.repeat(n)}
                  {'☆'.repeat(5 - n)} · {n} star{n === 1 ? '' : 's'}
                </option>
              ))}
            </select>
          </FieldShell>

          <FieldShell id="filter-source" label="Source">
            <select
              id="filter-source"
              value={state.source ?? ''}
              onChange={(e) => onNavigate({ source: e.target.value || null })}
              className={selectClasses}
            >
              <option value="">All sources</option>
              {REVIEW_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s === 'GOOGLE' ? 'Google' : 'Direct feedback'}
                </option>
              ))}
            </select>
          </FieldShell>

          <FieldShell id="filter-from" label="Posted from">
            <input
              id="filter-from"
              type="date"
              value={state.from ?? ''}
              max={state.to ?? undefined}
              aria-invalid={rangeInvalid || undefined}
              onChange={(e) => onNavigate({ from: e.target.value || null })}
              className={inputClasses}
            />
          </FieldShell>

          <FieldShell id="filter-to" label="Posted to">
            <input
              id="filter-to"
              type="date"
              value={state.to ?? ''}
              min={state.from ?? undefined}
              aria-invalid={rangeInvalid || undefined}
              onChange={(e) => onNavigate({ to: e.target.value || null })}
              className={inputClasses}
            />
          </FieldShell>

          <FieldShell id="filter-sort" label="Sort by">
            <select
              id="filter-sort"
              value={state.sort}
              onChange={(e) => onNavigate({ sort: e.target.value })}
              className={selectClasses}
            >
              {REVIEW_SORT_FIELDS.map((f) => (
                <option key={f} value={f}>
                  {SORT_LABELS[f]}
                </option>
              ))}
            </select>
          </FieldShell>

          <FieldShell id="filter-order" label="Order">
            <select
              id="filter-order"
              value={state.order}
              onChange={(e) => onNavigate({ order: e.target.value })}
              className={selectClasses}
            >
              <option value="desc">Newest / highest first</option>
              <option value="asc">Oldest / lowest first</option>
            </select>
          </FieldShell>

          <form
            className="flex min-w-[14rem] flex-1 items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              onNavigate({ q: draftQuery });
            }}
          >
            <FieldShell id="filter-q" label="Search reviewer or comment" grow>
              <input
                id="filter-q"
                type="search"
                value={draftQuery}
                onChange={(e) => setDraftQuery(e.target.value)}
                placeholder="e.g. great service"
                className={inputClasses}
              />
            </FieldShell>
            <button
              type="submit"
              className="inline-flex h-[38px] items-center justify-center rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              Search
            </button>
          </form>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-slate-600" aria-live="polite">
            {isPending ? (
              <span className="inline-flex items-center gap-2 font-medium text-indigo-700">
                <span
                  aria-hidden
                  className="h-3 w-3 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600"
                />
                Applying filters…
              </span>
            ) : (
              <>
                <span className="font-semibold tabular-nums text-slate-900">{total}</span>{' '}
                {total === 1 ? 'review' : 'reviews'}
                {isFiltered && ' match your filters'}
              </>
            )}
          </p>
          {isFiltered && (
            <button
              type="button"
              onClick={() => {
                setDraftQuery('');
                onReset();
              }}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const selectClasses =
  'block w-full rounded-lg border-0 bg-white px-3.5 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 transition focus:outline-none focus:ring-2 focus:ring-indigo-500';

const inputClasses =
  'block w-full rounded-lg border-0 bg-white px-3.5 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 transition placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 aria-[invalid=true]:ring-rose-400';

function FieldShell({ id, label, children, grow = false }) {
  return (
    <div className={grow ? 'min-w-[12rem] flex-1' : 'min-w-[11rem]'}>
      <label
        htmlFor={id}
        className="block text-xs font-medium uppercase tracking-wide text-slate-500"
      >
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
