import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';

const replace = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh }),
  usePathname: () => '/admin/reviews',
}));

// next/link rendered as a plain anchor so the table mounts in jsdom.
vi.mock('next/link', () => ({
  // eslint-disable-next-line @next/next/no-html-link-for-pages -- jsdom stub, not shipped
  default: ({ href, children, scroll, prefetch, ...rest }) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>
      {children}
    </a>
  ),
}));

// Server action — stubbed; the real auth/Prisma path is covered in
// adminReviewsAction.test.js.
vi.mock('@/app/admin/reviews/actions', () => ({ deleteReview: vi.fn() }));

// `useTransition` can't be held pending against a mocked router in jsdom
// (there's no RSC fetch to suspend on), so we replace it with a controllable
// stub. Navigation tests run with `pending=false`; loading-state tests flip
// it to `true` before rendering.
const transition = { pending: false };
vi.mock('react', async () => {
  const actual = await vi.importActual('react');
  return { ...actual, useTransition: () => [transition.pending, (fn) => fn()] };
});

import ReviewPanel, { UNDO_DELAY_MS } from '@/app/admin/reviews/components/ReviewPanel';
import { REVIEW_SEARCH_DEFAULTS } from '@/app/admin/reviews/searchParams';
import { deleteReview } from '@/app/admin/reviews/actions';

const baseState = { ...REVIEW_SEARCH_DEFAULTS };

const sampleItems = [
  {
    id: 'r1',
    rating: 5,
    reviewerName: 'Alice',
    comment: 'Great!',
    source: 'GOOGLE',
    postedAt: null,
  },
  { id: 'r2', rating: 2, reviewerName: 'Bob', comment: 'Meh', source: 'DIRECT', postedAt: null },
];

function renderPanel(state = baseState, paging = {}, items = sampleItems) {
  const { total = items.length, page = 1, pageSize = 20, pageCount = 1 } = paging;
  return render(
    <ReviewPanel
      state={state}
      items={items}
      total={total}
      page={page}
      pageSize={pageSize}
      pageCount={pageCount}
    />,
  );
}

describe('Review Management — ReviewPanel', () => {
  beforeEach(() => {
    replace.mockReset();
    refresh.mockReset();
    transition.pending = false;
    vi.mocked(deleteReview).mockReset().mockResolvedValue({ ok: true, deleted: true });
  });

  describe('URL-backed filter controls', () => {
    it('reflects incoming URL state in its controls', () => {
      renderPanel(
        {
          ...baseState,
          rating: 4,
          source: 'DIRECT',
          from: '2026-01-01',
          to: '2026-01-31',
          q: 'coffee',
        },
        { total: 7 },
      );
      expect(screen.getByLabelText(/star rating/i)).toHaveValue('4');
      expect(screen.getByLabelText(/source/i)).toHaveValue('DIRECT');
      expect(screen.getByLabelText(/posted from/i)).toHaveValue('2026-01-01');
      expect(screen.getByLabelText(/posted to/i)).toHaveValue('2026-01-31');
      expect(screen.getByLabelText(/search reviewer/i)).toHaveValue('coffee');
      expect(screen.getByText(/reviews match your filters/i)).toHaveTextContent(
        '7 reviews match your filters',
      );
    });

    it('writes the rating filter to the URL and resets to page 1', () => {
      renderPanel({ ...baseState, page: 5 }, { total: 100, page: 5, pageCount: 5 });
      fireEvent.change(screen.getByLabelText(/star rating/i), { target: { value: '3' } });
      expect(replace).toHaveBeenCalledWith('/admin/reviews?rating=3', { scroll: false });
    });

    it('writes the date-range filter to the URL', () => {
      renderPanel();
      fireEvent.change(screen.getByLabelText(/posted from/i), { target: { value: '2026-03-01' } });
      expect(replace).toHaveBeenLastCalledWith('/admin/reviews?from=2026-03-01', { scroll: false });
    });

    it('clearing a date input removes it from the URL', () => {
      renderPanel({ ...baseState, from: '2026-03-01', to: '2026-03-31' });
      fireEvent.change(screen.getByLabelText(/posted to/i), { target: { value: '' } });
      expect(replace).toHaveBeenLastCalledWith('/admin/reviews?from=2026-03-01', { scroll: false });
    });

    it('writes sort + order changes to the URL (rating sort already supported)', () => {
      renderPanel();
      fireEvent.change(screen.getByLabelText(/sort by/i), { target: { value: 'rating' } });
      expect(replace).toHaveBeenLastCalledWith('/admin/reviews?sort=rating', { scroll: false });

      fireEvent.change(screen.getByLabelText(/^order$/i), { target: { value: 'asc' } });
      expect(replace).toHaveBeenLastCalledWith('/admin/reviews?order=asc', { scroll: false });
    });

    it('buffers the search box and only navigates on submit', () => {
      renderPanel();
      const input = screen.getByLabelText(/search reviewer/i);
      fireEvent.change(input, { target: { value: 'rude' } });
      expect(replace).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: /^search$/i }));
      expect(replace).toHaveBeenCalledWith('/admin/reviews?q=rude', { scroll: false });
    });

    it('clears all filters back to the bare pathname', () => {
      renderPanel({ ...baseState, rating: 1, from: '2026-01-01', q: 'bad' }, { total: 3 });
      fireEvent.click(screen.getByRole('button', { name: /clear filters/i }));
      expect(replace).toHaveBeenCalledWith('/admin/reviews', { scroll: false });
    });

    it('hides the clear button when no filters are active', () => {
      renderPanel(baseState, { total: 3 });
      expect(screen.queryByRole('button', { name: /clear filters/i })).toBeNull();
    });

    it('paginates without resetting to page 1', () => {
      renderPanel({ ...baseState, rating: 5 }, { total: 50, page: 1, pageCount: 3 });
      fireEvent.click(screen.getByRole('button', { name: /next page/i }));
      expect(replace).toHaveBeenCalledWith('/admin/reviews?page=2&rating=5', { scroll: false });
    });
  });

  describe('loading feedback while a navigation is in flight', () => {
    it('renders no overlay and reports idle when not pending', () => {
      renderPanel(baseState, { total: 50, page: 1, pageCount: 3 });
      expect(screen.queryByTestId('review-loading-overlay')).toBeNull();
      expect(screen.getByTestId('review-results')).not.toHaveAttribute('aria-busy');
      expect(screen.getByTestId('review-row-r1')).toBeInTheDocument();
    });

    it('overlays a skeleton, marks the region busy and announces status when pending', () => {
      transition.pending = true;
      renderPanel(baseState, { total: 50, page: 1, pageCount: 3 });

      expect(screen.getByTestId('review-loading-overlay')).toBeInTheDocument();
      expect(screen.getByTestId('review-table-skeleton')).toBeInTheDocument();
      expect(screen.getByTestId('review-results')).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByText(/applying filters/i)).toBeInTheDocument();
      expect(screen.getByTestId('review-row-r1')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /next page/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /previous page/i })).toBeDisabled();
    });
  });

  describe('optimistic delete with 4-second Undo window', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    const clickDelete = (id, name) =>
      fireEvent.click(
        within(screen.getByTestId(`review-row-${id}`)).getByRole('button', {
          name: new RegExp(`delete review from ${name}`, 'i'),
        }),
      );

    it('hides the row instantly, shows an Undo toast, and does NOT call the server action yet', () => {
      renderPanel();
      clickDelete('r1', 'Alice');

      expect(screen.queryByTestId('review-row-r1')).toBeNull();
      expect(screen.getByTestId('review-row-r2')).toBeInTheDocument();
      const toast = screen.getByTestId('undo-toast-r1');
      expect(within(toast).getByRole('button', { name: /undo/i })).toBeInTheDocument();
      expect(deleteReview).not.toHaveBeenCalled();
    });

    it('Undo within the grace period restores the row and never calls the action', () => {
      renderPanel();
      clickDelete('r1', 'Alice');

      act(() => vi.advanceTimersByTime(UNDO_DELAY_MS - 1));
      expect(deleteReview).not.toHaveBeenCalled();

      fireEvent.click(
        within(screen.getByTestId('undo-toast-r1')).getByRole('button', { name: /undo/i }),
      );

      expect(screen.getByTestId('review-row-r1')).toBeInTheDocument();
      expect(screen.queryByTestId('undo-toast-r1')).toBeNull();

      // Let the original timer slot pass — still no server call.
      act(() => vi.advanceTimersByTime(UNDO_DELAY_MS));
      expect(deleteReview).not.toHaveBeenCalled();
    });

    it('commits to the server action once the 4-second window closes', async () => {
      renderPanel();
      clickDelete('r1', 'Alice');

      // advanceTimersByTimeAsync lets the awaited mock promise inside
      // `commit()` settle before act() resolves.
      await act(() => vi.advanceTimersByTimeAsync(UNDO_DELAY_MS));

      expect(deleteReview).toHaveBeenCalledTimes(1);
      expect(deleteReview).toHaveBeenCalledWith({ reviewId: 'r1' });
      expect(screen.queryByTestId('undo-toast-r1')).toBeNull();
      expect(refresh).toHaveBeenCalled();
    });

    it('queues independent timers per row so each can be undone separately', async () => {
      renderPanel();
      clickDelete('r1', 'Alice');
      act(() => vi.advanceTimersByTime(1000));
      clickDelete('r2', 'Bob');

      // Undo only the second.
      fireEvent.click(
        within(screen.getByTestId('undo-toast-r2')).getByRole('button', { name: /undo/i }),
      );
      expect(screen.getByTestId('review-row-r2')).toBeInTheDocument();

      await act(() => vi.advanceTimersByTimeAsync(UNDO_DELAY_MS));
      expect(deleteReview).toHaveBeenCalledTimes(1);
      expect(deleteReview).toHaveBeenCalledWith({ reviewId: 'r1' });
    });

    it('rolls back the optimistic hide and surfaces an error if the action fails', async () => {
      vi.mocked(deleteReview).mockResolvedValue({ ok: false, error: 'Unauthorized.' });
      renderPanel();
      clickDelete('r1', 'Alice');

      await act(() => vi.advanceTimersByTimeAsync(UNDO_DELAY_MS));

      // Row is back, error toast shown, no refresh.
      expect(screen.getByTestId('review-row-r1')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(/unauthorized/i);
      expect(refresh).not.toHaveBeenCalled();
    });

    it('aborts every uncommitted delete when the panel unmounts', () => {
      const { unmount } = renderPanel();
      clickDelete('r1', 'Alice');
      unmount();
      act(() => vi.advanceTimersByTime(UNDO_DELAY_MS * 2));
      expect(deleteReview).not.toHaveBeenCalled();
    });
  });
});
