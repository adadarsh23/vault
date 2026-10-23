/* @vitest-environment jsdom */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { RouteErrorBoundary } from '../RouteErrorBoundary';

function BrokenComponent(): never {
  throw new Error('Test route failure');
}

function BrokenChunkComponent(): never {
  throw new Error('Failed to fetch dynamically imported module: /assets/LazyPage.js');
}

function WorkingComponent() {
  return <div>Working Page</div>;
}

describe('RouteErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <RouteErrorBoundary>
          <div>Safe Content</div>
        </RouteErrorBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByText('Safe Content')).toBeDefined();
  });

  it('catches route errors and renders accessible error fallback with retry controls', () => {
    const onErrorSpy = vi.fn();

    render(
      <MemoryRouter initialEntries={['/broken']}>
        <RouteErrorBoundary onError={onErrorSpy}>
          <BrokenComponent />
        </RouteErrorBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText('Unable to Load Page')).toBeDefined();
    expect(screen.getByText('Test route failure')).toBeDefined();
    expect(screen.getByRole('button', { name: /Reload Page/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Go Back/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Vault Home/i })).toBeDefined();
    expect(onErrorSpy).toHaveBeenCalled();
  });

  it('shows friendly update/network message when chunk loading fails', () => {
    render(
      <MemoryRouter initialEntries={['/chunk-broken']}>
        <RouteErrorBoundary>
          <BrokenChunkComponent />
        </RouteErrorBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByText('Update or Connection Interruption')).toBeDefined();
    expect(
      screen.getByText(
        /A newer version of the vault was published or your internet connection dropped/i,
      ),
    ).toBeDefined();
  });

  it('automatically resets when user navigates to another route', () => {
    function AppHarness() {
      const navigate = useNavigate();
      return (
        <div>
          <button onClick={() => navigate('/safe')}>Navigate Safe</button>
          <RouteErrorBoundary>
            <Routes>
              <Route path="/broken" element={<BrokenComponent />} />
              <Route path="/safe" element={<WorkingComponent />} />
            </Routes>
          </RouteErrorBoundary>
        </div>
      );
    }

    render(
      <MemoryRouter initialEntries={['/broken']}>
        <AppHarness />
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toBeDefined();

    // Navigate to /safe
    fireEvent.click(screen.getByText('Navigate Safe'));

    // Automatically recovers
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Working Page')).toBeDefined();
  });

  it('supports custom fallback render function', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <RouteErrorBoundary
          fallback={({ error, reset }) => (
            <div>
              <span>Custom: {error.message}</span>
              <button onClick={reset}>Reset Me</button>
            </div>
          )}
        >
          <BrokenComponent />
        </RouteErrorBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByText('Custom: Test route failure')).toBeDefined();
    expect(screen.getByText('Reset Me')).toBeDefined();
  });
});
