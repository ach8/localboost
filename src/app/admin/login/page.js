import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_SESSION_COOKIE, verifyAdminSessionValue } from '@/lib/adminSession';
import LoginForm from './LoginForm';

export const metadata = {
  title: 'Sign in · LocalBoost Admin',
  description: 'Authenticate to access the LocalBoost internal maintenance console.',
};

export default function AdminLoginPage() {
  // If they're already signed in, skip the form.
  const auth = verifyAdminSessionValue(cookies().get(ADMIN_SESSION_COOKIE)?.value);
  if (auth.ok) {
    redirect('/admin/maintenance');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
            LocalBoost · Internal
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Admin sign-in</h1>
          <p className="mt-2 text-sm text-slate-600">
            Access is restricted to authorized operators.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ring-1 ring-slate-900/5 sm:p-8">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
