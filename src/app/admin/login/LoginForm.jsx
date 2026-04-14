'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { signInAdmin } from './actions';

const INITIAL_STATE = { error: null };

export default function LoginForm() {
  const [state, formAction] = useFormState(signInAdmin, INITIAL_STATE);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <div>
        <label htmlFor="admin-token" className="block text-sm font-medium text-slate-800">
          Admin token
        </label>
        <input
          id="admin-token"
          name="token"
          type="password"
          autoComplete="current-password"
          spellCheck={false}
          required
          aria-invalid={state?.error ? true : undefined}
          className="mt-2 block w-full rounded-lg border-0 bg-slate-50 px-3.5 py-2.5 font-mono text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 transition placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 aria-[invalid=true]:ring-rose-400"
        />
        <p className="mt-2 text-xs text-slate-500">
          Exchanged server-side for a short-lived HttpOnly session cookie. The token itself is never
          stored in the browser.
        </p>
      </div>

      {state?.error && (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          {state.error}
        </div>
      )}

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
    >
      {pending && (
        <span
          aria-hidden
          className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
        />
      )}
      {pending ? 'Signing in…' : 'Sign in'}
    </button>
  );
}
