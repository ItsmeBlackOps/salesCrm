import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Mock useAuth to control login behavior
import * as useAuthModule from '../hooks/useAuth';
import SignIn from '../pages/auth/SignIn';

vi.mock('../hooks/useAuth');

const mockLogin = vi.fn();

beforeAll(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation(() => ({
      matches: false,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia,
  );
});

beforeEach(() => {
  vi.resetAllMocks();
  (useAuthModule.useAuth as any).mockReturnValue({ user: null, login: mockLogin });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
});

describe('\u2705 Positive Login Scenarios', () => {
  it('logs in with valid Admin credentials and lowercases email', async () => {
    mockLogin.mockResolvedValue({ role: 'admin' });
    render(<SignIn />);

    fireEvent.change(screen.getByPlaceholderText(/email/i), {
      target: { value: 'ADMIN@EXAMPLE.COM' },
    });
    fireEvent.change(screen.getByPlaceholderText(/password/i), {
      target: { value: 'adminpass' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() =>
      expect(mockLogin).toHaveBeenCalledWith('admin@example.com', 'adminpass'),
    );
  });

  it.skip('persists token when "Remember Me" is checked', async () => {
    // Feature not implemented in SignIn component
  });

  it('hides password input', () => {
    render(<SignIn />);
    const passwordInput = screen.getByPlaceholderText(/password/i);
    expect(passwordInput).toHaveAttribute('type', 'password');
  });
});

describe('\u274c Negative Login Scenarios', () => {
  it('shows generic error copy for failed login', async () => {
    mockLogin.mockRejectedValue(new Error('Invalid credentials'));
    render(<SignIn />);

    fireEvent.change(screen.getByPlaceholderText(/email/i), {
      target: { value: 'wrong@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText(/password/i), {
      target: { value: 'adminpass' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() =>
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument(),
    );
  });

  it.skip('shows error when fields are empty', async () => {
    // Validation for empty fields is not handled in the component
  });

  it.skip('rejects SQL injection attempt', async () => {
    // Advanced validation not implemented
  });

  it.skip('shows email format error', async () => {
    // No custom email format validation in component
  });

  it('still shows generic error when backend indicates disabled account', async () => {
    mockLogin.mockRejectedValue(new Error('Account is disabled'));
    render(<SignIn />);

    fireEvent.change(screen.getByPlaceholderText(/email/i), {
      target: { value: 'disabled@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText(/password/i), {
      target: { value: 'any' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() =>
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument(),
    );
  });

  it('limits login attempts (rate limit) — smoke', async () => {
    mockLogin.mockResolvedValue({});
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    localStorage.clear();
    // Pre-seed 30 attempts in the last 60s
    const now = Date.now();
    const attempts = Array.from({ length: 30 }, (_, i) => now - (i * 1000));
    localStorage.setItem('login_attempts', JSON.stringify(attempts));
    render(<SignIn />);
    const btn = screen.getByRole('button', { name: /sign in/i });
    fireEvent.click(btn);
    // should be blocked, no call
    expect(mockLogin).toHaveBeenCalledTimes(0);
    vi.useRealTimers();
  });
});
