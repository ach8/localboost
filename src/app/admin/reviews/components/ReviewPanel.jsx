'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { serializeReviewSearchParams } from '../searchParams';
import { deleteReview } from '../actions';
import ReviewFilters from './ReviewFilters';
import ReviewTable from './ReviewTable';
import Pagination from './Pagination';
import ReviewTableSkeleton from './ReviewTableSkeleton';
import UndoToast from './UndoToast';

// Grace period before a row delete is committed to the database. The row is
// hidden optimistically the instant the operator clicks Delete; the Server
// Action only fires once this window closes without an Undo.
export const UNDO_DELAY_MS = 4000;

/**
 * Client shell for the review dashboard. Owns:
 *  - URL navigation + the `useTransition` pending flag (skeleton overlay)
 *  - The optimistic-delete queue: { id → { label, timer } }
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

  // ---- Optimistic delete with Undo ---------------------------------------
  // `pending` is render state (drives hiddenIds + toast list). `timersRef`
  // holds the live setTimeout handles so Undo / unmount can cancel them
  // without churning React state.
  const [pending, setPending] = useState([]); // Array<{ id, label }>
  const [deleteError, setDeleteError] = useState(null);
  const timersRef = useRef(new Map());

  const commit = useCallback(
    async (id) => {
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
        router.refresh();
      } else {
        // Roll back the optimistic hide so the operator can see the row that
        // failed to delete and try again.
        setPending((list) => list.filter((p) => p.id !== id));
        setDeleteError(result?.error ?? 'Failed to delete review.');
      }
    },
    [router],
  );

  const scheduleDelete = useCallback(
    (review) => {
      const id = review.id;
      if (timersRef.current.has(id)) return; // already queued

      setDeleteError(null);
      setPending((list) => [...list, { id, label: review.reviewerName || 'Anonymous' }]);
      const timer = setTimeout(() => commit(id), UNDO_DELAY_MS);
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
            onDelete={scheduleDelete}
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

      <UndoToast
        pending={pending}
        error={deleteError}
        onUndo={undo}
        onDismissError={() => setDeleteError(null)}
      />
    </section>
  );
}
