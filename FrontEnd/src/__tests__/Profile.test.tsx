import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import * as useAuthModule from '../hooks/useAuth';
import { Toaster } from '../components/ui/toaster';
vi.mock('../hooks/useAuth');
import Profile from '../pages/Profile';

vi.mock('../components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const mockFetchWithAuth = vi.fn();
const mockRefreshUser = vi.fn();

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
  // Stub ResizeObserver for Radix-based components
  // @ts-ignore
  vi.stubGlobal('ResizeObserver', class { observe(){} unobserve(){} disconnect(){} });
});

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  mockFetchWithAuth.mockImplementation((url: RequestInfo, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/me') && (!init || init.method === 'GET')) {
      return Promise.resolve({ ok: true, json: async () => ({ userid: 1, name: 'Alice', email: 'alice@example.com', roleid: 2 }) } as Response);
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
  });
  mockRefreshUser.mockImplementation(async () => {
    await mockFetchWithAuth('/me');
  });
  (useAuthModule.useAuth as any).mockReturnValue({
    user: { userid: 1, name: 'Alice', email: 'alice@example.com', roleid: 2 },
    fetchWithAuth: mockFetchWithAuth,
    refreshUser: mockRefreshUser,
  });
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
      <Profile />
      <Toaster />
    </div>
  );
}

describe('03 – My Profile', () => {
  it('T01-PROFILE-LOAD-ME: renders current user; email not editable', async () => {
    renderWithToaster();
    expect(await screen.findByText(/profile/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Alice')).toBeInTheDocument();
    const emailInput = screen.getByDisplayValue('alice@example.com') as HTMLInputElement;
    expect(emailInput).toBeInTheDocument();
    // Email should not be editable (readOnly)
    expect(emailInput).toHaveAttribute('readonly');
    // Should expose an Edit Profile entry point for inline edit
    expect(screen.getByRole('button', { name: /edit profile/i })).toBeInTheDocument();
  });

  it('T02-PROFILE-EDIT-SELF: PUT /me on save; toast and refetch', async () => {
    const putSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
    mockFetchWithAuth.mockImplementation((url: RequestInfo, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/me') && init?.method === 'PUT') return putSpy(url, init);
      if (u.includes('/me')) return Promise.resolve({ ok: true, json: async () => ({ userid: 1, name: 'Alice', email: 'alice@example.com', roleid: 2 }) } as Response);
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    });

    renderWithToaster();
    // Enter edit mode
    await userEvent.click(screen.getByRole('button', { name: /edit profile/i }));
    // Change allowed field(s)
    const nameInput = screen.getByLabelText(/name/i) as HTMLInputElement;
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Alice Johnson');
    // Submit
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(putSpy).toHaveBeenCalled());
    const [, init] = putSpy.mock.calls[0] as [RequestInfo, RequestInit];
    expect(init?.method).toBe('PUT');
    expect(init?.headers).toBeDefined();
    const payload = JSON.parse(String(init?.body || '{}'));
    expect(payload).toMatchObject({ name: 'Alice Johnson' });
    // Refresh triggered
    expect(mockRefreshUser).toHaveBeenCalled();
    // Success toast
    await screen.findByText(/profile updated/i);
  });

  it('T03-PASSWORD-DIALOG-VALIDATION: mismatched confirm shows client error; no network', async () => {
    renderWithToaster();
    // Open dialog
    await userEvent.click(screen.getByRole('button', { name: /change password/i }));
    // Fill with mismatch
    await userEvent.type(screen.getByLabelText(/current password/i), 'oldpass');
    await userEvent.type(screen.getByLabelText(/^new password$/i), 'Newpass123');
    await userEvent.type(screen.getByLabelText(/confirm.*password/i), 'Wrongpass');
    await userEvent.click(screen.getByRole('button', { name: /update password/i }));
    // Client-side validation message
    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
    // No network calls for change-password
    expect(mockFetchWithAuth).not.toHaveBeenCalledWith(expect.stringMatching(/change-password/), expect.anything());
  });

  it('T04-PASSWORD-SUCCESS: submits to /change-password; shows success toast', async () => {
    mockFetchWithAuth.mockImplementation((url: RequestInfo, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/change-password') && init?.method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    });
    renderWithToaster();
    await userEvent.click(screen.getByRole('button', { name: /change password/i }));
    await userEvent.type(screen.getByLabelText(/current password/i), 'oldpass');
    await userEvent.type(screen.getByLabelText(/^new password$/i), 'Newpass123');
    await userEvent.type(screen.getByLabelText(/confirm.*password/i), 'Newpass123');
    await userEvent.click(screen.getByRole('button', { name: /update password/i }));
    await waitFor(() =>
      expect(mockFetchWithAuth).toHaveBeenCalledWith(
        expect.stringMatching(/change-password/),
        expect.objectContaining({ method: 'POST' })
      )
    );
    await screen.findByText(/password updated/i);
  });

  it('T05-PROFILE-NO-PII-ERRORS: shows generic error; hides server message', async () => {
    mockFetchWithAuth.mockImplementation((url: RequestInfo, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/me') && init?.method === 'PUT') {
        return Promise.resolve({ ok: false, status: 400, json: async () => ({ message: 'SQLSTATE[42P01]: relation "users" does not exist' }) } as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
    });

    renderWithToaster();
    await userEvent.click(screen.getByRole('button', { name: /edit profile/i }));
    const nameInput = screen.getByLabelText(/name/i) as HTMLInputElement;
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Alice 2');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    // Should show a generic error message (not raw backend content)
    await screen.findByText(/error/i);
    expect(screen.queryByText(/SQLSTATE|relation "users"/i)).not.toBeInTheDocument();
  });
});
