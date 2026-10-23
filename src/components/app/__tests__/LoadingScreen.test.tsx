/* @vitest-environment jsdom */

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LoadingScreen } from '../LoadingScreen';

describe('LoadingScreen', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders default loading message with accessibility attributes', () => {
    render(<LoadingScreen />);
    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders customized label text', () => {
    render(<LoadingScreen label="Synchronizing encrypted keys..." />);
    expect(screen.getByText('Synchronizing encrypted keys...')).toBeInTheDocument();
  });

  it('surfaces recovery reload button after timeout period', () => {
    const handleRetry = vi.fn();
    render(<LoadingScreen onRetry={handleRetry} />);

    expect(screen.queryByText(/Taking longer than expected/i)).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(7500);
    });

    expect(screen.getByText(/Taking longer than expected/i)).toBeInTheDocument();
    const retryBtn = screen.getByRole('button', { name: /Try Again/i });
    expect(retryBtn).toBeInTheDocument();

    fireEvent.click(retryBtn);
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });
});
