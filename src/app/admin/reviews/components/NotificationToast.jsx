'use client';

/**
 * Stacked toast renderer for response-workflow feedback (accept / regenerate
 * / delete confirmations and errors). Each entry is purely presentational —
 * lifecycle (auto-dismiss, ids) is owned by `ReviewPanel` so the queue can be
 * shared across action handlers without a context boundary.
 *
 * Success toasts are rendered on an emerald background; errors take the
 * rose palette and an `alert` role so assistive tech surfaces them
 * immediately. Both can be dismissed manually at any time.
 */
export default function NotificationToast({ toasts, onDismiss }) {
  if (!Array.isArray(toasts) || toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      data-testid="notification-toast-region"
      className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6"
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function Toast({ toast, onDismiss }) {
  const isError = toast.tone === 'error';
  const palette = isError
    ? 'border-rose-200 bg-rose-50 text-rose-900'
    : 'border-emerald-200 bg-emerald-50 text-emerald-900';
  const dismissHover = isError
    ? 'hover:bg-rose-100 text-rose-700'
    : 'hover:bg-emerald-100 text-emerald-700';

  return (
    <div
      data-testid={`notification-toast-${toast.id}`}
      data-tone={toast.tone}
      role={isError ? 'alert' : 'status'}
      className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-lg ring-1 ring-black/5 ${palette}`}
    >
      <span aria-hidden className="mt-0.5 text-lg leading-none">
        {isError ? '⚠' : '✓'}
      </span>
      <div className="min-w-0 flex-1">
        {toast.title && <p className="text-sm font-semibold">{toast.title}</p>}
        {toast.message && (
          <p className={`break-words text-sm ${toast.title ? 'mt-0.5' : ''}`}>{toast.message}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className={`-mr-1 -mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition ${dismissHover}`}
      >
        ×
      </button>
    </div>
  );
}
