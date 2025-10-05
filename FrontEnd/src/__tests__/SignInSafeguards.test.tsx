import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import * as useAuthModule from '../hooks/useAuth';
import SignIn from '../pages/auth/SignIn';
import { Toaster } from '../components/ui/toaster';

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
  // Stub ResizeObserver required by radix checkbox in JSDOM
  // @ts-ignore
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  (useAuthModule.useAuth as any).mockReturnValue({ user: null, login: mockLogin });
});

afterEach(() => {
  cleanup();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

function renderWithToaster() {
  return render(
    <div>
      <SignIn />
      <Toaster />
    </div>
  );
}

describe('SignIn UI safeguards', () => {
  it('blocks submission when 30 attempts already present (no network)', () => {
    mockLogin.mockResolvedValue({});
    const now = Date.now();
    const attempts = Array.from({ length: 30 }, (_, i) => now - (i * 1000));
    localStorage.setItem('login_attempts', JSON.stringify(attempts));
    renderWithToaster();
    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText(/password/i), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(mockLogin).toHaveBeenCalledTimes(0);
  });

  it('shows generic error copy on failure', async () => {
    mockLogin.mockRejectedValueOnce(new Error('User not found'));
    renderWithToaster();
    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: 'x@y.com' } });
    fireEvent.change(screen.getByPlaceholderText(/password/i), { target: { value: 'p' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/invalid email or password/i));
  });

  it('requires soft CAPTCHA when flagged, and allows after checking', async () => {
    mockLogin.mockResolvedValue({});
    localStorage.setItem('login_captcha_required', '1');
    renderWithToaster();
    const btn = screen.getByRole('button', { name: /sign in/i });
    // Ensure label is present and interact with the first checkbox
    expect(await screen.findByText(/i am not a robot/i)).toBeInTheDocument();
    const checkbox = screen.getByRole('checkbox');
    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText(/password/i), { target: { value: 'x' } });
    fireEvent.click(btn);
    expect(mockLogin).toHaveBeenCalledTimes(0);
    fireEvent.click(checkbox);
    fireEvent.click(btn);
    await waitFor(() => expect(mockLogin).toHaveBeenCalledTimes(1));
  });

  it('shows correct countdown seconds in rate-limit toast', () => {
    mockLogin.mockResolvedValue({});
    // Seed 30 attempts, earliest 20s ago -> remaining ~40s
    const now = Date.now();
    const attempts = Array.from({ length: 30 }, (_, i) => now - (i < 29 ? i * 500 : 20_000));
    localStorage.setItem('login_attempts', JSON.stringify(attempts));
    renderWithToaster();
    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText(/password/i), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    // Toast is synchronous
    expect(screen.getByText(/Too many attempts/i)).toBeInTheDocument();
    expect(screen.getByText(/Try again in 4\d?s\./i)).toBeInTheDocument();
  });

  it('rate limit resets after 60s window (31st allowed after window)', async () => {
    mockLogin.mockResolvedValue({});
    // Pre-seed 30 attempts within current window
    const now = Date.now();
    const attempts = Array.from({ length: 30 }, (_, i) => now - i * 1000);
    localStorage.setItem('login_attempts', JSON.stringify(attempts));
    renderWithToaster();
    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText(/password/i), { target: { value: 'x' } });
    // 31st within window -> blocked
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(mockLogin).toHaveBeenCalledTimes(0);
    // Simulate window expiry by aging attempts beyond 60s
    const oldAttempts = attempts.map(() => Date.now() - 70_000);
    localStorage.setItem('login_attempts', JSON.stringify(oldAttempts));
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(mockLogin).toHaveBeenCalledTimes(1));
  });

  it('CAPTCHA persists across remount until success, then clears', async () => {
    mockLogin.mockResolvedValue({});
    localStorage.setItem('login_captcha_required', '1');
    const { unmount } = renderWithToaster();
    expect(screen.getByText(/i am not a robot/i)).toBeInTheDocument();
    // Remount (like refresh)
    unmount();
    renderWithToaster();
    expect(screen.getByText(/i am not a robot/i)).toBeInTheDocument();
    // Complete CAPTCHA then succeed -> requirement should clear
    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByPlaceholderText(/password/i), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(mockLogin).toHaveBeenCalledTimes(1));
    // Remount again -> CAPTCHA no longer required
    cleanup();
    renderWithToaster();
    expect(screen.queryByText(/i am not a robot/i)).not.toBeInTheDocument();
  });
});
