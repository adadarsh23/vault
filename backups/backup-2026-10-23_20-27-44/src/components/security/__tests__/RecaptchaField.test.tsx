/* @vitest-environment jsdom */

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RecaptchaField } from '../RecaptchaField';

// Mock ReCAPTCHA component
vi.mock('react-google-recaptcha', () => {
  return {
    default: vi.fn(({ onChange, onExpired, onErrored, asyncScriptOnLoad, theme }) => {
      return (
        <div data-testid="mock-recaptcha" data-theme={theme}>
          <button
            type="button"
            data-testid="simulate-verify"
            onClick={() => {
              asyncScriptOnLoad?.();
              onChange('mock-token-xyz');
            }}
          >
            Verify
          </button>
          <button type="button" data-testid="simulate-expired" onClick={() => onExpired?.()}>
            Expire
          </button>
          <button type="button" data-testid="simulate-error" onClick={() => onErrored?.()}>
            Error
          </button>
        </div>
      );
    }),
  };
});

// Mock theme store
const mockThemeState = { theme: 'dark' };
vi.mock('../../../store/themeStore', () => ({
  useThemeStore: (selector: (state: typeof mockThemeState) => unknown) => selector(mockThemeState),
}));

describe('RecaptchaField Component', () => {
  const defaultProps = {
    id: 'test-recaptcha',
    token: null,
    status: 'idle' as const,
    onChange: vi.fn(),
    onExpired: vi.fn(),
    onError: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_RECAPTCHA_SITE_KEY', '6LeIx0cDId_test_key_placeholder');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders missing site key warning if VITE_RECAPTCHA_SITE_KEY is empty', () => {
    vi.stubEnv('VITE_RECAPTCHA_SITE_KEY', '');

    render(<RecaptchaField {...defaultProps} />);

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(
      screen.getByText(/Security challenge is unavailable\. Configure VITE_RECAPTCHA_SITE_KEY/i),
    ).toBeTruthy();
  });

  it('renders reCAPTCHA widget and label when site key is present', () => {
    render(<RecaptchaField {...defaultProps} />);

    expect(screen.getByText(/Prove you are human/i)).toBeTruthy();
    expect(screen.getByTestId('mock-recaptcha')).toBeTruthy();
    expect(screen.getByTestId('mock-recaptcha').getAttribute('data-theme')).toBe('dark');
  });

  it('triggers onChange when CAPTCHA is solved', () => {
    render(<RecaptchaField {...defaultProps} />);

    const verifyBtn = screen.getByTestId('simulate-verify');
    fireEvent.click(verifyBtn);

    expect(defaultProps.onChange).toHaveBeenCalledWith('mock-token-xyz');
  });

  it('triggers onExpired when CAPTCHA expires', () => {
    render(<RecaptchaField {...defaultProps} />);

    const expireBtn = screen.getByTestId('simulate-expired');
    fireEvent.click(expireBtn);

    expect(defaultProps.onExpired).toHaveBeenCalledTimes(1);
  });

  it('triggers onError and shows retry button when widget encounters error', () => {
    render(<RecaptchaField {...defaultProps} status="error" />);

    const errorBtn = screen.getByTestId('simulate-error');
    fireEvent.click(errorBtn);

    expect(defaultProps.onError).toHaveBeenCalledTimes(1);

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    expect(retryBtn).toBeTruthy();

    act(() => {
      fireEvent.click(retryBtn);
    });

    // After retry clicked, it attempts re-loading
    expect(screen.getByText(/Verifying secure connection/i)).toBeTruthy();
  });

  it('displays verified success text when status is verified or token exists', () => {
    render(<RecaptchaField {...defaultProps} token="mock-token-123" status="verified" />);

    expect(screen.getByText(/CAPTCHA completed\./i)).toBeTruthy();
  });

  it('displays custom message when provided', () => {
    render(<RecaptchaField {...defaultProps} message="Custom verification message" />);

    expect(screen.getByText('Custom verification message')).toBeTruthy();
  });

  it('applies disabled styles, inert attribute and accessibility flags', () => {
    render(<RecaptchaField {...defaultProps} disabled={true} />);

    const container = screen.getByTestId('test-recaptcha-container');
    expect(container).toBeTruthy();
    const disabledWrapper = container.querySelector('.opacity-60');
    expect(disabledWrapper).toBeTruthy();
    expect(disabledWrapper?.hasAttribute('inert')).toBe(true);
  });

  it('marks widget ready immediately if window.grecaptcha is already loaded', () => {
    const originalGrecaptcha = (window as unknown as { grecaptcha?: unknown }).grecaptcha;
    (window as unknown as { grecaptcha?: { render: () => void } }).grecaptcha = { render: vi.fn() };

    render(<RecaptchaField {...defaultProps} />);

    // Loader skeleton should not be visible when grecaptcha is already ready
    expect(screen.queryByText(/Verifying secure connection/i)).toBeNull();

    (window as unknown as { grecaptcha?: unknown }).grecaptcha = originalGrecaptcha;
  });
});
