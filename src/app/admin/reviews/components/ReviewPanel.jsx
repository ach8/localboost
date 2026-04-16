'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { serializeReviewSearchParams } from '../searchParams';
import { approveReviewResponse, deleteReview, regenerateReviewResponse } from '../actions';
import ReviewFilters from './ReviewFilters';
import ReviewTable from './ReviewTable';
import Pagination from './Pagination';
import ReviewTableSkeleton from './ReviewTableSkeleton';
import UndoToast from './UndoToast';
import NotificationToast from './NotificationToast';

// Grace period before a row delete is committed to the database. The row is
// hidden optimistically the instant the operator clicks Delete; the Server
// Action only fires once this window closes without an Undo.
export const UNDO_DELAY_MS = 4000;

// Lifetime of a status toast. Successes disappear quickly so they do not
// clutter the viewport; errors linger so operators have time to read them.
export const TOAST_SUCCESS_MS = 4000;
export const TOAST_ERROR_MS = 8000;

let toastSeq = 0;
const nextToastId = () => `t_${++toastSeq}_${Date.now()}`;

/**
 * Client shell for the review dashboard. Owns:
 *  - URL navigation + the `useTransition` pending flag (skeleton overlay)
 *  - The optimistic-delete queue: { id → { label, timer } }
 *  - The expanded-response state (one row at a time) and its accept /
 *    regenerate action tracking.
 *  - A status-toast queue: every response-workflow action (and the delete
 *    commit) pushes a success / error toast so operators get an explicit
 *    confirmation or failure message.
 *
 * The table is now rendered here (not as `children`) because optimistic
 * hiding requires the panel to filter rows by id before render.
 */
export default function ReviewPanel({ state, items, total, page, pageSize, pageCount }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  // ---- URL navigation -----------------------------------------------------
  const navigate = useCallback(
    (patch, { resetPage = true } = {}) => {
      const next = { ...state, ...patch };
      if (resetPage) next.page = 1;
      const qs = serializeReviewSearchParams(next);
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [router, pathname, state],
  );

  const reset = useCallback(() => {
    startTransition(() => router.replace(pathname, { scroll: false }));
  }, [router, pathname]);

  // ---- Status-toast queue -------------------------------------------------
  const [toasts, setToasts] = useState([]); // Array<{ id, tone, title?, message? }>
  const toastTimersRef = useRef(new Map());

  const dismissToast = useCallback((id) => {
    const timer = toastTimersRef.current.get(id);
    if (timer) clearTimeout(timer);
    toastTimersRef.current.delete(id);
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    ({ tone, title, message }) => {
      const id = nextToastId();
      setToasts((list) => [...list, { id, tone, title, message }]);
      const lifetime = tone === 'error' ? TOAST_ERROR_MS : TOAST_SUCCESS_MS;
      const timer = setTimeout(() => dismissToast(id), lifetime);
      toastTimersRef.current.set(id, timer);
      return id;
    },
    [dismissToast],
  );

  // Abort every pending auto-dismiss timer when the panel unmounts to avoid
  // `setState after unmount` warnings in Strict Mode.
  useEffect(() => {
    const timers = toastTimersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  // ---- Optimistic delete with Undo ---------------------------------------
  // `pending` is render state (drives hiddenIds + toast list). `timersRef`
  // holds the live setTimeout handles so Undo / unmount can cancel them
  // without churning React state.
  const [pending, setPending] = useState([]); // Array<{ id, label }>
  const timersRef = useRef(new Map());

  const commit = useCallback(
    async (id, label) => {
      timersRef.current.delete(id);
      let result;
      try {
        result = await deleteReview({ reviewId: id });
      } catch {
        result = { ok: false, error: 'Unable to reach the server. The review was not deleted.' };
      }

      if (result?.ok) {
        // Keep the row hidden; revalidatePath in the action will refresh the
        // RSC payload so totals/paging catch up on the next render.
        setPending((list) => list.filter((p) => p.id !== id));
        pushToast({
          tone: 'success',
          title: 'Review deleted',
          message: label ? `Removed review from ${label}.` : 'Review removed.',
        });
        router.refresh();
      } else {
        // Roll back the optimistic hide so the operator can see the row that
        // failed to delete and try again.
        setPending((list) => list.filter((p) => p.id !== id));
        pushToast({
          tone: 'error',
          title: 'Couldn’t delete review',
          message: result?.error ?? 'Failed to delete review.',
        });
      }
    },
    [router, pushToast],
  );

  const scheduleDelete = useCallback(
    (review) => {
      const id = review.id;
      if (timersRef.current.has(id)) return; // already queued

      const label = review.reviewerName || 'Anonymous';
      setPending((list) => [...list, { id, label }]);
      const timer = setTimeout(() => commit(id, label), UNDO_DELAY_MS);
      timersRef.current.set(id, timer);
    },
    [commit],
  );

  const undo = useCallback((id) => {
    const timer = timersRef.current.get(id);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(id);
    setPending((list) => list.filter((p) => p.id !== id));
  }, []);

  // Abort every uncommitted delete on unmount. If the operator navigates away
  // they can no longer see (or click) Undo, so committing silently would be
  // the unsafe choice.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  // ---- Response workflow: expand / accept / regenerate -------------------
  const [expandedId, setExpandedId] = useState(null);
  const [pendingResponseIds, setPendingResponseIds] = useState(() => new Set());

  const markResponsePending = useCallback((reviewId, on) => {
    setPendingResponseIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(reviewId);
      else next.delete(reviewId);
      return next;
    });
  }, []);

  const toggleExpand = useCallback((reviewId) => {
    setExpandedId((current) => (current === reviewId ? null : reviewId));
  }, []);

  // Helper: look up the reviewer label for toast copy. We intentionally read
  // the *current* items prop (closed over by the handler) rather than the
  // optimistically-hidden set — so even a deleted-in-parallel review still
  // gets a meaningful toast.
  const labelFor = useCallback(
    (reviewId) => items.find((r) => r.id === reviewId)?.reviewerName || 'Anonymous',
    [items],
  );

  const approve = useCallback(
    async (responseId, reviewId) => {
      if (!responseId) return;
      markResponsePending(reviewId, true);
      let result;
      try {
        result = await approveReviewResponse({ responseId });
      } catch {
        result = { ok: false, error: 'Unable to reach the server. The response was not approved.' };
      }
      markResponsePending(reviewId, false);
      if (result?.ok) {
        pushToast({
          tone: 'success',
          title: 'Response approved',
          message: `The AI response for ${labelFor(reviewId)} is now marked approved.`,
        });
        router.refresh();
      } else {
        pushToast({
          tone: 'error',
          title: 'Couldn’t approve response',
          message: result?.error ?? 'Failed to approve response.',
        });
      }
    },
    [markResponsePending, pushToast, labelFor, router],
  );

  const regenerate = useCallback(
    async (reviewId) => {
      if (!reviewId) return;
      markResponsePending(reviewId, true);
      let result;
      try {
        result = await regenerateReviewResponse({ reviewId });
      } catch {
        result = {
          ok: false,
          error: 'Unable to reach the server. The response was not regenerated.',
        };
      }
      markResponsePending(reviewId, false);
      if (result?.ok) {
        pushToast({
          tone: 'success',
          title: 'New response generated',
          message: `A fresh AI draft is ready for ${labelFor(reviewId)}.`,
        });
        router.refresh();
      } else {
        pushToast({
          tone: 'error',
          title: 'Couldn’t regenerate response',
          message: result?.error ?? 'Failed to regenerate response.',
        });
      }
    },
    [markResponsePending, pushToast, labelFor, router],
  );

  const hiddenIds = new Set(pending.map((p) => p.id));

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-900/5">
      <ReviewFilters
        state={state}
        total={total}
        isPending={isPending}
        onNavigate={navigate}
        onReset={reset}
      />

      <div className="relative" aria-busy={isPending || undefined} data-testid="review-results">
        <div
          className={
            isPending ? 'pointer-events-none select-none opacity-40 transition-opacity' : undefined
          }
        >
          <ReviewTable
            items={items}
            state={state}
            hiddenIds={hiddenIds}
            expandedId={expandedId}
            pendingResponseIds={pendingResponseIds}
            onDelete={scheduleDelete}
            onToggleExpand={toggleExpand}
            onApprove={approve}
            onRegenerate={regenerate}
          />
          <Pagination
            state={state}
            page={page}
            pageSize={pageSize}
            pageCount={pageCount}
            total={total}
            isPending={isPending}
            onNavigate={navigate}
          />
        </div>

        {isPending && (
          <div
            data-testid="review-loading-overlay"
            className="absolute inset-0 flex flex-col bg-white/60 backdrop-blur-[1px]"
          >
            <ReviewTableSkeleton rows={Math.min(pageSize, 8)} />
          </div>
        )}
      </div>

      <UndoToast pending={pending} error={null} onUndo={undo} onDismissError={() => {}} />

      <NotificationToast toasts={toasts} onDismiss={dismissToast} />
    </section>
  );
}
