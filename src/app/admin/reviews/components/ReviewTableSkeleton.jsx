/**
 * Shimmering placeholder that mirrors the ReviewTable layout.
 * Rendered by `loading.js` on first paint and by `ReviewPanel` as an overlay
 * while a filter / page change is in flight.
 */
export default function ReviewTableSkeleton({ rows = 6 }) {
  return (
    <div
      data-testid="review-table-skeleton"
      role="status"
      aria-label="Loading reviews"
      className="divide-y divide-slate-100"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-6 px-6 py-4 sm:px-8">
          <Shimmer className="h-4 w-24" />
          <Shimmer className="h-4 w-20" />
          <Shimmer className="h-4 w-28" />
          <Shimmer className="h-4 flex-1" />
          <Shimmer className="h-5 w-16 rounded-full" />
          <Shimmer className="h-5 w-20 rounded-full" />
        </div>
      ))}
      <span className="sr-only">Loading reviews…</span>
    </div>
  );
}

function Shimmer({ className = '' }) {
  return <span aria-hidden className={`block animate-pulse rounded bg-slate-200 ${className}`} />;
}
