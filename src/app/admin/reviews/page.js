import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionValue } from '@/lib/adminSession';
import { listReviews } from '@/lib/reviewQuery';
import { parseReviewSearchParams } from './searchParams';
import { signOutAdmin } from '../login/actions';
import ReviewPanel from './components/ReviewPanel';

export const metadata = {
  title: 'Reviews · LocalBoost Admin',
  description: 'Manage, filter and respond to customer feedback across all connected channels.',
};

// Filters live in the URL, so this route must always render fresh.
export const dynamic = 'force-dynamic';

export default async function ReviewsPage({ searchParams }) {
  const auth = verifyAdminSessionValue(cookies().get(ADMIN_SESSION_COOKIE)?.value);
  if (!auth.ok) {
    redirect('/admin/login');
  }

  // The URL is the single source of truth for filter / sort / page state.
  // Parsing is forgiving so shared / hand-edited links degrade gracefully.
  const state = parseReviewSearchParams(searchParams);
  const { items, total, page, pageSize, pageCount } = await listReviews(state);

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
              LocalBoost · Admin
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Review Management
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600">
              Browse, filter and sort customer feedback from every connected channel. The current
              view is encoded in the URL — copy the address bar to share exactly what you see.
            </p>
          </div>
          <form action={signOutAdmin}>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
            >
              Sign out
            </button>
          </form>
        </header>

        <ReviewPanel
          state={state}
          items={items}
          total={total}
          page={page}
          pageSize={pageSize}
          pageCount={pageCount}
        />
      </div>
    </main>
  );
}
