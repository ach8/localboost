'use client';

import { MAX_PAGE_SIZE } from '../searchParams';

const PAGE_SIZE_OPTIONS = [10, 20, 50, MAX_PAGE_SIZE];

/**
 * Drives through the panel-owned `onNavigate` so page changes participate in
 * the same `useTransition` as filter changes — the skeleton overlay therefore
 * appears for prev/next/page-size too. The URL is still updated, so the view
 * remains shareable from the address bar.
 */
export default function Pagination({ page, pageSize, pageCount, total, isPending, onNavigate }) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label="Review pagination"
      className="flex flex-col gap-4 border-t border-slate-100 bg-slate-50/60 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8"
    >
      <p className="text-sm text-slate-600">
        Showing <span className="font-semibold tabular-nums text-slate-900">{from}</span>–
        <span className="font-semibold tabular-nums text-slate-900">{to}</span> of{' '}
        <span className="font-semibold tabular-nums text-slate-900">{total}</span>
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <span id="page-size-label" className="text-sm text-slate-600">
          Per page
        </span>
        <div
          role="group"
          aria-labelledby="page-size-label"
          className="flex overflow-hidden rounded-lg ring-1 ring-inset ring-slate-300"
        >
          {PAGE_SIZE_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onNavigate({ pageSize: n })}
              disabled={isPending}
              aria-current={n === pageSize ? 'true' : undefined}
              className={`px-3 py-1.5 text-sm tabular-nums transition disabled:cursor-not-allowed ${
                n === pageSize
                  ? 'bg-indigo-600 font-semibold text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        <div className="ml-2 flex items-center gap-1">
          <PageButton
            onClick={() => onNavigate({ page: page - 1 }, { resetPage: false })}
            disabled={isPending || page <= 1}
            aria-label="Previous page"
          >
            ‹ Prev
          </PageButton>
          <span className="px-2 text-sm tabular-nums text-slate-600">
            {page} / {pageCount}
          </span>
          <PageButton
            onClick={() => onNavigate({ page: page + 1 }, { resetPage: false })}
            disabled={isPending || page >= pageCount}
            aria-label="Next page"
          >
            Next ›
          </PageButton>
        </div>
      </div>
    </nav>
  );
}

function PageButton({ disabled, children, ...rest }) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="inline-flex items-center rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-300 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:text-slate-300 disabled:ring-slate-200 disabled:hover:bg-white"
      {...rest}
    >
      {children}
    </button>
  );
}
