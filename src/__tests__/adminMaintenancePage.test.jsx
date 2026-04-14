import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

// Server action import is stubbed so the client component can be rendered
// in jsdom without hitting Prisma.
vi.mock('@/app/admin/maintenance/actions', () => ({
  runReviewJobCleanup: vi.fn(),
}));

import CleanupPanel from '@/app/admin/maintenance/CleanupPanel';
import { runReviewJobCleanup } from '@/app/admin/maintenance/actions';

const runCleanup = () => fireEvent.click(screen.getByRole('button', { name: /run cleanup/i }));

const setDays = (value) =>
  fireEvent.change(screen.getByLabelText(/older than/i), {
    target: { value: String(value), valueAsNumber: value },
  });

const typeConfirmPhrase = (value) =>
  fireEvent.change(screen.getByLabelText(/type\s+delete\s+to confirm/i), {
    target: { value },
  });

const getDialog = () => screen.getByRole('dialog');
const queryDialog = () => screen.queryByRole('dialog');

describe('Admin Maintenance — CleanupPanel', () => {
  beforeEach(() => {
    vi.mocked(runReviewJobCleanup).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not render any admin token input', () => {
    render(<CleanupPanel />);
    expect(screen.queryByLabelText(/admin api token/i)).toBeNull();
    expect(screen.queryByLabelText(/token/i)).toBeNull();
  });

  it('opens a typed-confirmation dialog on first click and does NOT run the action', () => {
    render(<CleanupPanel />);
    runCleanup();

    // Dialog is now open with the destructive warning.
    const dialog = getDialog();
    expect(within(dialog).getByText(/confirm destructive cleanup/i)).toBeInTheDocument();
    // No server action call yet — that's the whole point.
    expect(runReviewJobCleanup).not.toHaveBeenCalled();
  });

  it('keeps the confirm button disabled until DELETE is typed', () => {
    render(<CleanupPanel />);
    runCleanup();

    const dialog = getDialog();
    const confirmButton = within(dialog).getByRole('button', { name: /delete records/i });
    expect(confirmButton).toBeDisabled();

    typeConfirmPhrase('DELET');
    expect(confirmButton).toBeDisabled();

    typeConfirmPhrase('DELETE');
    expect(confirmButton).toBeEnabled();
  });

  it('cancels without calling the action', () => {
    render(<CleanupPanel />);
    runCleanup();
    fireEvent.click(within(getDialog()).getByRole('button', { name: /cancel/i }));

    expect(queryDialog()).toBeNull();
    expect(runReviewJobCleanup).not.toHaveBeenCalled();
  });

  it('cancels on Escape press', () => {
    render(<CleanupPanel />);
    runCleanup();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(queryDialog()).toBeNull();
    expect(runReviewJobCleanup).not.toHaveBeenCalled();
  });

  it('runs the cleanup and shows the deleted count on confirmed success', async () => {
    vi.mocked(runReviewJobCleanup).mockResolvedValue({
      ok: true,
      data: {
        deletedCount: 12,
        cutoff: '2026-03-14T12:00:00.000Z',
        olderThanDays: 30,
      },
    });

    render(<CleanupPanel />);
    runCleanup();
    typeConfirmPhrase('DELETE');
    fireEvent.click(within(getDialog()).getByRole('button', { name: /delete records/i }));

    await waitFor(() => expect(runReviewJobCleanup).toHaveBeenCalledTimes(1));
    expect(runReviewJobCleanup).toHaveBeenCalledWith({ olderThanDays: 30 });

    const banner = await screen.findByRole('status');
    expect(banner).toHaveTextContent(/cleanup complete/i);
    expect(screen.getByTestId('deleted-count')).toHaveTextContent('12');
    expect(banner).toHaveTextContent(/12\s+records/i);
    expect(banner).toHaveTextContent('2026-03-14T12:00:00.000Z');

    // Modal has closed on success.
    expect(queryDialog()).toBeNull();
  });

  it('forwards a custom olderThanDays value', async () => {
    vi.mocked(runReviewJobCleanup).mockResolvedValue({
      ok: true,
      data: { deletedCount: 0, cutoff: 'x', olderThanDays: 7 },
    });

    render(<CleanupPanel />);
    setDays(7);
    runCleanup();
    typeConfirmPhrase('DELETE');
    fireEvent.click(within(getDialog()).getByRole('button', { name: /delete records/i }));

    await waitFor(() => expect(runReviewJobCleanup).toHaveBeenCalledTimes(1));
    expect(runReviewJobCleanup).toHaveBeenCalledWith({ olderThanDays: 7 });
  });

  it('shows an error banner when the action reports a failure', async () => {
    vi.mocked(runReviewJobCleanup).mockResolvedValue({
      ok: false,
      error: 'Failed to clean up review jobs',
    });

    render(<CleanupPanel />);
    runCleanup();
    typeConfirmPhrase('DELETE');
    fireEvent.click(within(getDialog()).getByRole('button', { name: /delete records/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/cleanup failed/i);
    expect(alert).toHaveTextContent(/failed to clean up review jobs/i);
    expect(queryDialog()).toBeNull();
  });

  it('shows a friendly message on unexpected throw', async () => {
    vi.mocked(runReviewJobCleanup).mockRejectedValue(new Error('boom'));

    render(<CleanupPanel />);
    runCleanup();
    typeConfirmPhrase('DELETE');
    fireEvent.click(within(getDialog()).getByRole('button', { name: /delete records/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/unable to reach the server/i);
  });
});
