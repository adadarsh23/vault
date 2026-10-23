/* @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock Sentry module before imports
vi.mock('@sentry/react', () => {
  return {
    withScope: vi.fn((cb: (scope: any) => void) => {
      const scope = {
        setTag: vi.fn(),
        setContext: vi.fn(),
      };
      cb(scope);
    }),
    captureException: vi.fn(() => 'test-sentry-event-id'),
  };
});

import * as SentryModule from '@sentry/react';
import * as SentryLib from '../../lib/sentry';
import { ErrorBoundary, withErrorBoundary } from '../ErrorBoundary';

// Mock broken component for triggering render failures
function ProblemChild({
  shouldThrow = true,
  message = 'Component crash!',
}: {
  shouldThrow?: boolean;
  message?: string;
}) {
  if (shouldThrow) {
    throw new Error(message);
  }
  return <div>Child content rendered safely</div>;
}

describe('ErrorBoundary component', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={false} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Child content rendered safely')).toBeInTheDocument();
  });

  it('catches render error and displays the default responsive fallback UI', () => {
    render(
      <ErrorBoundary name="TestCard">
        <ProblemChild shouldThrow={true} message="Critical rendering crash" />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Something went wrong in TestCard/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try Again/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reload/i })).toBeInTheDocument();
  });

  it('calls onError callback with normalized error when catching', () => {
    const onErrorSpy = vi.fn();

    render(
      <ErrorBoundary onError={onErrorSpy}>
        <ProblemChild shouldThrow={true} message="Test error callback" />
      </ErrorBoundary>,
    );

    expect(onErrorSpy).toHaveBeenCalledTimes(1);
    expect(onErrorSpy.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onErrorSpy.mock.calls[0][0].message).toBe('Test error callback');
  });

  it('supports custom ReactNode fallback', () => {
    render(
      <ErrorBoundary fallback={<div data-testid="custom-fallback">Custom Error Fallback</div>}>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
    expect(screen.getByText('Custom Error Fallback')).toBeInTheDocument();
  });

  it('supports standard React error boundary render function fallback', () => {
    render(
      <ErrorBoundary
        fallback={(error, resetErrorBoundary) => (
          <div>
            <span>Error occurred: {error.message}</span>
            <button type="button" onClick={resetErrorBoundary}>
              Recover
            </button>
          </div>
        )}
      >
        <ProblemChild shouldThrow={true} message="Function fallback test" />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Error occurred: Function fallback test')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Recover/i })).toBeInTheDocument();
  });

  it('supports Sentry-style ({ error, resetError }) signature in fallback', () => {
    render(
      <ErrorBoundary
        fallback={({ error, resetError }: any) => (
          <div>
            <span>Sentry Style: {error.message}</span>
            <button type="button" onClick={resetError}>
              Reset Sentry
            </button>
          </div>
        )}
      >
        <ProblemChild shouldThrow={true} message="Sentry signature test" />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Sentry Style: Sentry signature test')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reset Sentry/i })).toBeInTheDocument();
  });

  it('re-renders children when Try Again is clicked after fixing the error condition', () => {
    let shouldThrow = true;
    const onResetSpy = vi.fn();

    function FlakyComponent() {
      if (shouldThrow) {
        throw new Error('Transient failure');
      }
      return <div>Recovered successfully!</div>;
    }

    render(
      <ErrorBoundary onReset={onResetSpy}>
        <FlakyComponent />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Now resolve the issue
    shouldThrow = false;

    fireEvent.click(screen.getByRole('button', { name: /Try Again/i }));

    expect(onResetSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Recovered successfully!')).toBeInTheDocument();
  });

  it('automatically resets when resetKeys array changes', () => {
    let shouldThrow = true;

    function ConditionalChild() {
      if (shouldThrow) {
        throw new Error('Initial fail');
      }
      return <div>Clean on key change</div>;
    }

    const { rerender } = render(
      <ErrorBoundary resetKeys={['first-key']}>
        <ConditionalChild />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Change key and heal error
    shouldThrow = false;
    rerender(
      <ErrorBoundary resetKeys={['second-key']}>
        <ConditionalChild />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Clean on key change')).toBeInTheDocument();
  });

  it('toggles technical details and copies error info to clipboard', async () => {
    const clipboardWriteSpy = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: clipboardWriteSpy,
      },
    });

    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={true} message="Details & copy test" />
      </ErrorBoundary>,
    );

    // Initially technical details are hidden
    expect(screen.queryByText(/Diagnostics/i)).not.toBeInTheDocument();

    // Toggle details
    fireEvent.click(screen.getByRole('button', { name: /Technical details/i }));
    expect(screen.getByText(/Diagnostics/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Details & copy test/i).length).toBeGreaterThanOrEqual(1);

    // Click copy button
    const copyBtn = screen.getByRole('button', { name: /Copy error details/i });
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(clipboardWriteSpy).toHaveBeenCalled();
    });

    // Check indicator
    expect(screen.getByText(/Copied/i)).toBeInTheDocument();
  });

  it('safely handles Sentry telemetry when sentry is enabled', () => {
    vi.spyOn(SentryLib, 'sentryIsEnabled').mockReturnValue(true);

    render(
      <ErrorBoundary name="TelemetryBoundary">
        <ProblemChild shouldThrow={true} message="Telemetry error" />
      </ErrorBoundary>,
    );

    expect(SentryModule.withScope).toHaveBeenCalled();
    expect(SentryModule.captureException).toHaveBeenCalled();
  });

  it('works with withErrorBoundary HOC wrapper', () => {
    const RawComponent = ({ title }: { title: string }) => {
      throw new Error(`Crash in ${title}`);
    };

    const SafeComponent = withErrorBoundary(RawComponent, { name: 'HOCComponent' });

    render(<SafeComponent title="TestHOC" />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Something went wrong in HOCComponent/i)).toBeInTheDocument();
  });
});
