import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionValue } from '@/lib/adminSession';
import CleanupPanel from './CleanupPanel';
import { signOutAdmin } from '../login/actions';

export const metadata = {
  title: 'Maintenance · LocalBoost Admin',
  description: 'Internal operations console for LocalBoost background services.',
};

export default function MaintenancePage() {
  // First line of defence. The Server Action re-checks the session itself,
  // so direct POSTs without a valid cookie are rejected regardless of this.
  const auth = verifyAdminSessionValue(cookies().get(ADMIN_SESSION_COOKIE)?.value);
  if (!auth.ok) {
    redirect('/admin/login');
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 lg:py-16">
        <header className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
              LocalBoost · Internal
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Maintenance Console
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600">
              Operational tooling for the AI review-response pipeline. You are signed in as an
              authorized admin; session expires after 8 hours of inactivity.
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

        <CleanupPanel />
      </div>
    </main>
  );
}
