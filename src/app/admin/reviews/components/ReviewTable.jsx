'use client';

import Link from 'next/link';
import { serializeReviewSearchParams } from '../searchParams';

const SORTABLE_COLUMNS = [
  { key: 'rating', label: 'Rating', widthClass: 'w-32' },
  { key: 'postedAt', label: 'Posted', widthClass: 'w-40' },
];

const EMPTY_SET = new Set();
const TOTAL_COLUMN_COUNT = 7;

export default function ReviewTable({
  items,
  state,
  hiddenIds = EMPTY_SET,
  expandedId = null,
  pendingResponseIds = EMPTY_SET,
  onDelete,
  onToggleExpand,
  onApprove,
  onRegenerate,
}) {
  const visible = items.filter((r) => !hiddenIds.has(r.id));

  if (visible.length === 0) {
    return (
      <div className="px-6 py-16 text-center sm:px-8">
        <p className="text-sm font-medium text-slate-900">No reviews match your filters.</p>
        <p className="mt-1 text-sm text-slate-500">
          Try widening the star-rating range or clearing the search term.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            {SORTABLE_COLUMNS.map((col) => (
              <SortHeader key={col.key} column={col} state={state} />
            ))}
            <th scope="col" className={thClasses}>
              Reviewer
            </th>
            <th scope="col" className={thClasses}>
              Feedback
            </th>
            <th scope="col" className={`${thClasses} w-28`}>
              Source
            </th>
            <th scope="col" className={`${thClasses} w-32`}>
              Response
            </th>
            <th scope="col" className={`${thClasses} w-40 text-right`}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {visible.map((review) => {
            const isExpanded = expandedId === review.id;
            const isResponsePending = pendingResponseIds.has(review.id);
            return (
              <ReviewRow
                key={review.id}
                review={review}
                isExpanded={isExpanded}
                isResponsePending={isResponsePending}
                onDelete={onDelete}
                onToggleExpand={onToggleExpand}
                onApprove={onApprove}
                onRegenerate={onRegenerate}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SortHeader({ column, state }) {
  const isActive = state.sort === column.key;
  const nextOrder = isActive && state.order === 'desc' ? 'asc' : 'desc';
  const qs = serializeReviewSearchParams({ ...state, sort: column.key, order: nextOrder, page: 1 });
  const href = qs ? `?${qs}` : '?';

  return (
    <th scope="col" className={`${thClasses} ${column.widthClass}`}>
      <Link
        href={href}
        scroll={false}
        className="group inline-flex items-center gap-1 hover:text-slate-900"
      >
        {column.label}
        <span
          aria-hidden
          className={`text-xs transition ${isActive ? 'text-indigo-600' : 'text-slate-300 group-hover:text-slate-400'}`}
        >
          {isActive ? (state.order === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </Link>
    </th>
  );
}

function ReviewRow({
  review,
  isExpanded,
  isResponsePending,
  onDelete,
  onToggleExpand,
  onApprove,
  onRegenerate,
}) {
  const { id, rating, reviewerName, comment, source, postedAt, business, response } = review;
  const canExpand = Boolean(response);
  const label = reviewerName || 'Anonymous';

  return (
    <>
      <tr data-testid={`review-row-${id}`} className="align-top hover:bg-slate-50/60">
        <td className="whitespace-nowrap px-6 py-4 text-sm">
          <span aria-label={`${rating} out of 5 stars`} className="font-medium text-amber-500">
            {'★'.repeat(rating)}
            <span className="text-slate-200">{'★'.repeat(5 - rating)}</span>
          </span>
        </td>
        <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">
          {postedAt ? new Date(postedAt).toLocaleDateString() : '—'}
        </td>
        <td className="px-6 py-4 text-sm">
          <div className="font-medium text-slate-900">{label}</div>
          {business?.name && <div className="mt-0.5 text-xs text-slate-500">{business.name}</div>}
        </td>
        <td className="max-w-md px-6 py-4 text-sm text-slate-700">
          {comment ? (
            <p className="line-clamp-3 leading-relaxed">{comment}</p>
          ) : (
            <span className="italic text-slate-400">No comment provided</span>
          )}
        </td>
        <td className="whitespace-nowrap px-6 py-4">
          <SourceBadge source={source} />
        </td>
        <td className="whitespace-nowrap px-6 py-4">
          <ResponseBadge status={response?.status} />
        </td>
        <td className="whitespace-nowrap px-6 py-4 text-right">
          <div className="inline-flex items-center gap-1">
            {canExpand && (
              <button
                type="button"
                onClick={() => onToggleExpand?.(id)}
                aria-expanded={isExpanded}
                aria-controls={`review-response-${id}`}
                aria-label={
                  isExpanded
                    ? `Hide AI response for review from ${label}`
                    : `View AI response for review from ${label}`
                }
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-indigo-700 transition hover:bg-indigo-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
              >
                <ChevronIcon
                  className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                />
                {isExpanded ? 'Hide' : 'View'}
              </button>
            )}
            <button
              type="button"
              onClick={() => onDelete?.(review)}
              aria-label={`Delete review from ${label}`}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-rose-700 transition hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500"
            >
              <TrashIcon className="h-4 w-4" />
              Delete
            </button>
          </div>
        </td>
      </tr>
      {isExpanded && response && (
        <tr data-testid={`review-response-row-${id}`} className="bg-slate-50/50">
          <td colSpan={TOTAL_COLUMN_COUNT} className="px-6 py-4">
            <ResponsePanel
              id={id}
              response={response}
              isResponsePending={isResponsePending}
              onApprove={onApprove}
              onRegenerate={onRegenerate}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function ResponsePanel({ id, response, isResponsePending, onApprove, onRegenerate }) {
  const canApprove = response.status !== 'APPROVED' && response.status !== 'PUBLISHED';

  return (
    <div
      id={`review-response-${id}`}
      data-testid={`review-response-${id}`}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
            AI-generated response
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Status: <span className="font-medium text-slate-700">{response.status}</span>
          </p>
        </div>
      </div>

      <p
        data-testid={`review-response-content-${id}`}
        className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-800"
      >
        {response.content}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onApprove?.(response.id, id)}
          disabled={isResponsePending || !canApprove}
          data-testid={`approve-response-${id}`}
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-300"
        >
          {canApprove ? 'Accept' : 'Accepted'}
        </button>
        <button
          type="button"
          onClick={() => onRegenerate?.(id)}
          disabled={isResponsePending}
          data-testid={`regenerate-response-${id}`}
          className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isResponsePending ? 'Regenerating…' : 'Reject & Regenerate'}
        </button>
        {isResponsePending && (
          <span
            data-testid={`response-pending-${id}`}
            role="status"
            className="text-xs font-medium text-slate-500"
          >
            Working…
          </span>
        )}
      </div>
    </div>
  );
}

function ChevronIcon({ className }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={className}>
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 011.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function TrashIcon({ className }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={className}>
      <path
        fillRule="evenodd"
        d="M8.75 1A2.75 2.75 0 006 3.75V4H3.75a.75.75 0 000 1.5h.3l.81 11.34A2.75 2.75 0 007.6 19h4.8a2.75 2.75 0 002.74-2.16L15.95 5.5h.3a.75.75 0 000-1.5H14v-.25A2.75 2.75 0 0011.25 1h-2.5zM7.5 4v-.25c0-.69.56-1.25 1.25-1.25h2.5c.69 0 1.25.56 1.25 1.25V4h-5zM8.5 8.25a.75.75 0 011.5 0v6a.75.75 0 01-1.5 0v-6zm3.25-.75a.75.75 0 00-.75.75v6a.75.75 0 001.5 0v-6a.75.75 0 00-.75-.75z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function SourceBadge({ source }) {
  const isGoogle = source === 'GOOGLE';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
        isGoogle
          ? 'bg-sky-50 text-sky-700 ring-sky-200'
          : 'bg-violet-50 text-violet-700 ring-violet-200'
      }`}
    >
      {isGoogle ? 'Google' : 'Direct'}
    </span>
  );
}

function ResponseBadge({ status }) {
  if (!status) {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
        No response
      </span>
    );
  }
  const tones = {
    DRAFT: 'bg-amber-50 text-amber-800 ring-amber-200',
    APPROVED: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    PUBLISHED: 'bg-indigo-50 text-indigo-800 ring-indigo-200',
    REJECTED: 'bg-rose-50 text-rose-800 ring-rose-200',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${tones[status] ?? tones.DRAFT}`}
    >
      {status.toLowerCase()}
    </span>
  );
}

const thClasses =
  'px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500';
