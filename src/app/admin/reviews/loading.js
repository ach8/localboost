import ReviewTableSkeleton from './components/ReviewTableSkeleton';

/**
 * Suspense fallback for the /admin/reviews segment. Shown on first paint
 * and on hard navigations while the server component awaits Prisma.
 * Soft (filter/page) navigations are handled separately by ReviewPanel's
 * `useTransition` overlay so the filter bar never unmounts.
 */
export default function ReviewsLoading() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
            LocalBoost · Admin
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Review Management
          </h1>
        </header>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-900/5">
          <div className="border-b border-slate-100 bg-gradient-to-r from-white to-slate-50 px-6 py-5 sm:px-8">
            <div className="flex flex-wrap gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <span
                  key={i}
                  aria-hidden
                  className="h-9 w-40 animate-pulse rounded-lg bg-slate-200"
                />
              ))}
            </div>
          </div>
          <ReviewTableSkeleton rows={8} />
        </section>
      </div>
    </main>
  );
}
