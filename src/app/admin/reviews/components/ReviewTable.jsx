'use client';

import Link from 'next/link';
import { serializeReviewSearchParams } from '../searchParams';

const SORTABLE_COLUMNS = [
  { key: 'rating', label: 'Rating', widthClass: 'w-32' },
  { key: 'postedAt', label: 'Posted', widthClass: 'w-40' },
];

const EMPTY_SET = new Set();

export default function ReviewTable({ items, state, hiddenIds = EMPTY_SET, onDelete }) {
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
            <th scope="col" className={`${thClasses} w-24 text-right`}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {visible.map((review) => (
            <ReviewRow key={review.id} review={review} onDelete={onDelete} />
          ))}
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

function ReviewRow({ review, onDelete }) {
  const { id, rating, reviewerName, comment, source, postedAt, business, response } = review;
  return (
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
        <div className="font-medium text-slate-900">{reviewerName || 'Anonymous'}</div>
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
        <button
          type="button"
          onClick={() => onDelete?.(review)}
          aria-label={`Delete review from ${reviewerName || 'Anonymous'}`}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-rose-700 transition hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500"
        >
          <TrashIcon className="h-4 w-4" />
          Delete
        </button>
      </td>
    </tr>
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
