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

// Server actions — stubbed; the real auth/Prisma path is covered in
// adminReviewsAction.test.js.
vi.mock('@/app/admin/reviews/actions', () => ({
  deleteReview: vi.fn(),
  approveReviewResponse: vi.fn(),
  regenerateReviewResponse: vi.fn(),
}));

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
import {
  approveReviewResponse,
  deleteReview,
  regenerateReviewResponse,
} from '@/app/admin/reviews/actions';

const baseState = { ...REVIEW_SEARCH_DEFAULTS };

const sampleItems = [
  {
    id: 'r1',
    rating: 5,
    reviewerName: 'Alice',
    comment: 'Great!',
    source: 'GOOGLE',
    postedAt: null,
    response: {
      id: 'resp_r1',
      status: 'DRAFT',
      content: 'Thanks so much, Alice! We appreciate your kind words.',
    },
  },
  {
    id: 'r2',
    rating: 2,
    reviewerName: 'Bob',
    comment: 'Meh',
    source: 'DIRECT',
    postedAt: null,
    response: null,
  },
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
    vi.mocked(approveReviewResponse)
      .mockReset()
      .mockResolvedValue({ ok: true, response: { id: 'resp_r1', status: 'APPROVED' } });
    vi.mocked(regenerateReviewResponse)
      .mockReset()
      .mockResolvedValue({
        ok: true,
        response: {
          id: 'resp_r1',
          status: 'DRAFT',
          content: 'Newly regenerated response.',
          updatedAt: new Date('2026-04-15T12:00:00.000Z'),
        },
      });
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

    it('rolls back the optimistic hide and surfaces an error toast if the action fails', async () => {
      vi.mocked(deleteReview).mockResolvedValue({ ok: false, error: 'Unauthorized.' });
      renderPanel();
      clickDelete('r1', 'Alice');

      await act(() => vi.advanceTimersByTimeAsync(UNDO_DELAY_MS));

      // Row is back, error toast shown, no refresh.
      expect(screen.getByTestId('review-row-r1')).toBeInTheDocument();
      const region = screen.getByTestId('notification-toast-region');
      expect(region).toHaveTextContent(/couldn.t delete review/i);
      expect(region).toHaveTextContent(/unauthorized/i);
      expect(refresh).not.toHaveBeenCalled();
    });

    it('shows a success toast confirming the delete when the commit succeeds', async () => {
      renderPanel();
      clickDelete('r1', 'Alice');

      await act(() => vi.advanceTimersByTimeAsync(UNDO_DELAY_MS));

      const region = screen.getByTestId('notification-toast-region');
      expect(region).toHaveTextContent(/review deleted/i);
      expect(region).toHaveTextContent(/alice/i);
    });

    it('aborts every uncommitted delete when the panel unmounts', () => {
      const { unmount } = renderPanel();
      clickDelete('r1', 'Alice');
      unmount();
      act(() => vi.advanceTimersByTime(UNDO_DELAY_MS * 2));
      expect(deleteReview).not.toHaveBeenCalled();
    });
  });

  describe('AI response workflow — expand, accept, regenerate', () => {
    const clickView = (id, name) =>
      fireEvent.click(
        within(screen.getByTestId(`review-row-${id}`)).getByRole('button', {
          name: new RegExp(`view ai response for review from ${name}`, 'i'),
        }),
      );

    it('does not render an expanded panel by default', () => {
      renderPanel();
      expect(screen.queryByTestId('review-response-r1')).toBeNull();
    });

    it('omits the View button entirely for reviews without an AI response', () => {
      renderPanel();
      const row = screen.getByTestId('review-row-r2');
      expect(within(row).queryByRole('button', { name: /view ai response/i })).toBeNull();
    });

    it('expands the row to reveal the full generated content and workflow buttons', () => {
      renderPanel();
      clickView('r1', 'Alice');

      const panel = screen.getByTestId('review-response-r1');
      expect(panel).toBeInTheDocument();
      expect(screen.getByTestId('review-response-content-r1')).toHaveTextContent(
        /thanks so much, alice/i,
      );
      expect(within(panel).getByTestId('approve-response-r1')).toBeEnabled();
      expect(within(panel).getByTestId('regenerate-response-r1')).toBeEnabled();
      expect(
        screen.getByRole('button', { name: /hide ai response for review from alice/i }),
      ).toHaveAttribute('aria-expanded', 'true');
    });

    it('toggles the expansion closed on a second click', () => {
      renderPanel();
      clickView('r1', 'Alice');
      fireEvent.click(
        screen.getByRole('button', { name: /hide ai response for review from alice/i }),
      );
      expect(screen.queryByTestId('review-response-r1')).toBeNull();
    });

    it('accepts a draft response: calls approveReviewResponse, refreshes, and toasts success', async () => {
      renderPanel();
      clickView('r1', 'Alice');

      await act(async () => {
        fireEvent.click(screen.getByTestId('approve-response-r1'));
      });

      expect(approveReviewResponse).toHaveBeenCalledWith({ responseId: 'resp_r1' });
      expect(refresh).toHaveBeenCalled();

      const region = screen.getByTestId('notification-toast-region');
      const toast = within(region).getAllByRole('status')[0];
      expect(toast).toHaveAttribute('data-tone', 'success');
      expect(toast).toHaveTextContent(/response approved/i);
      expect(toast).toHaveTextContent(/alice/i);
    });

    it('surfaces a rejection error from approveReviewResponse as a toast, without refreshing', async () => {
      vi.mocked(approveReviewResponse).mockResolvedValue({ ok: false, error: 'Forbidden.' });
      renderPanel();
      clickView('r1', 'Alice');

      await act(async () => {
        fireEvent.click(screen.getByTestId('approve-response-r1'));
      });

      expect(refresh).not.toHaveBeenCalled();
      const alert = screen.getByRole('alert');
      expect(alert).toHaveAttribute('data-tone', 'error');
      expect(alert).toHaveTextContent(/couldn.t approve response/i);
      expect(alert).toHaveTextContent(/forbidden/i);
    });

    it('hides Accept for an already-APPROVED response (operator cannot re-approve)', () => {
      const approvedItems = [
        {
          ...sampleItems[0],
          response: {
            id: 'resp_r1',
            status: 'APPROVED',
            content: 'Already accepted content.',
          },
        },
        sampleItems[1],
      ];
      renderPanel(baseState, {}, approvedItems);
      clickView('r1', 'Alice');
      expect(screen.getByTestId('approve-response-r1')).toBeDisabled();
      // Regenerate is still available — operators can replace an approved draft.
      expect(screen.getByTestId('regenerate-response-r1')).toBeEnabled();
    });

    it('rejects & regenerates: triggers regenerateReviewResponse, refreshes, and toasts success', async () => {
      renderPanel();
      clickView('r1', 'Alice');

      await act(async () => {
        fireEvent.click(screen.getByTestId('regenerate-response-r1'));
      });

      expect(regenerateReviewResponse).toHaveBeenCalledWith({ reviewId: 'r1' });
      expect(refresh).toHaveBeenCalled();

      const region = screen.getByTestId('notification-toast-region');
      const toast = within(region).getAllByRole('status')[0];
      expect(toast).toHaveAttribute('data-tone', 'success');
      expect(toast).toHaveTextContent(/new response generated/i);
    });

    it('disables the workflow buttons while regeneration is in-flight', async () => {
      let resolveRegen;
      vi.mocked(regenerateReviewResponse).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveRegen = resolve;
          }),
      );

      renderPanel();
      clickView('r1', 'Alice');

      await act(async () => {
        fireEvent.click(screen.getByTestId('regenerate-response-r1'));
      });

      expect(screen.getByTestId('approve-response-r1')).toBeDisabled();
      expect(screen.getByTestId('regenerate-response-r1')).toBeDisabled();
      expect(screen.getByTestId('response-pending-r1')).toBeInTheDocument();

      await act(async () => {
        resolveRegen({
          ok: true,
          response: {
            id: 'resp_r1',
            status: 'DRAFT',
            content: 'fresh',
            updatedAt: new Date(),
          },
        });
      });

      expect(refresh).toHaveBeenCalled();
    });

    it('surfaces an error-toast when regeneration is blocked by moderation', async () => {
      vi.mocked(regenerateReviewResponse).mockResolvedValue({
        ok: false,
        error: 'Generated response was flagged by moderation. Please try again.',
      });
      renderPanel();
      clickView('r1', 'Alice');

      await act(async () => {
        fireEvent.click(screen.getByTestId('regenerate-response-r1'));
      });

      expect(refresh).not.toHaveBeenCalled();
      const alert = screen.getByRole('alert');
      expect(alert).toHaveAttribute('data-tone', 'error');
      expect(alert).toHaveTextContent(/couldn.t regenerate response/i);
      expect(alert).toHaveTextContent(/moderation/i);

      // Operator can dismiss the toast manually.
      fireEvent.click(within(alert).getByRole('button', { name: /dismiss notification/i }));
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('handles a network failure on approve without leaving buttons stuck in pending', async () => {
      vi.mocked(approveReviewResponse).mockRejectedValue(new Error('offline'));
      renderPanel();
      clickView('r1', 'Alice');

      await act(async () => {
        fireEvent.click(screen.getByTestId('approve-response-r1'));
      });

      const alert = screen.getByRole('alert');
      expect(alert).toHaveAttribute('data-tone', 'error');
      expect(alert).toHaveTextContent(/unable to reach the server/i);
      expect(screen.getByTestId('approve-response-r1')).toBeEnabled();
      expect(screen.getByTestId('regenerate-response-r1')).toBeEnabled();
    });
  });

  describe('response-status filter', () => {
    it('reflects the incoming responseStatus in the dropdown', () => {
      renderPanel({ ...baseState, responseStatus: 'DRAFT' }, { total: 3 });
      expect(screen.getByLabelText(/response status/i)).toHaveValue('DRAFT');
    });

    it('writes responseStatus to the URL when an operator picks one, resetting to page 1', () => {
      renderPanel({ ...baseState, page: 4 }, { total: 100, page: 4, pageCount: 5 });
      fireEvent.change(screen.getByLabelText(/response status/i), { target: { value: 'DRAFT' } });
      expect(replace).toHaveBeenCalledWith('/admin/reviews?responseStatus=DRAFT', {
        scroll: false,
      });
    });

    it('offers a dedicated "No response yet" option for reviews that still need generation', () => {
      renderPanel();
      const select = screen.getByLabelText(/response status/i);
      fireEvent.change(select, { target: { value: 'NONE' } });
      expect(replace).toHaveBeenLastCalledWith('/admin/reviews?responseStatus=NONE', {
        scroll: false,
      });
    });

    it('clearing the dropdown removes the filter from the URL', () => {
      renderPanel({ ...baseState, responseStatus: 'REJECTED' });
      fireEvent.change(screen.getByLabelText(/response status/i), { target: { value: '' } });
      expect(replace).toHaveBeenLastCalledWith('/admin/reviews', { scroll: false });
    });

    it('surfaces the "Clear filters" button when only responseStatus differs from default', () => {
      renderPanel({ ...baseState, responseStatus: 'DRAFT' });
      expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument();
    });
  });

  describe('toast auto-dismissal', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('removes a success toast automatically after its lifetime elapses', async () => {
      renderPanel();
      fireEvent.click(
        within(screen.getByTestId(`review-row-r1`)).getByRole('button', {
          name: /view ai response for review from alice/i,
        }),
      );

      await act(async () => {
        fireEvent.click(screen.getByTestId('approve-response-r1'));
      });

      expect(screen.getByTestId('notification-toast-region')).toHaveTextContent(
        /response approved/i,
      );

      // Success toasts auto-dismiss after TOAST_SUCCESS_MS (4s).
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.queryByTestId('notification-toast-region')).toBeNull();
    });
  });
});
