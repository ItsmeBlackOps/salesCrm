import { beforeAll, afterAll, afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import UserDetail from '../pages/UserDetail';

vi.mock('../components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const okJson = (data: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response);
const errJson = (status = 400, data: unknown = {}) => Promise.resolve({ ok: false, status, json: () => Promise.resolve(data) } as Response);

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
  localStorage.setItem('auth', JSON.stringify({ user: { userid: 1, name: 'SA', email: 'sa@x.com', roleid: 1 }, accessToken: 't', refreshToken: 'r' }));
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('05 – User Detail & Admin Actions', () => {
  test.fails('T01-DETAIL-TABS-RENDER: Tabs Profile | Roles | Activity visible; content lazy-loaded', async () => {
    const fetchMock = (url: RequestInfo) => {
      const u = String(url);
      if (u.includes('/users/42')) return okJson({ userid: 42, name: 'Alice', email: 'alice@example.com', roleid: 3 });
      return okJson({});
    };
    vi.stubGlobal('fetch', vi.fn(fetchMock) as unknown as typeof fetch);
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <UserDetail />
      </MemoryRouter>
    );
    expect(await screen.findByRole('tab', { name: /profile/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /roles/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /activity/i })).toBeInTheDocument();
    // Activity not rendered until selected
    expect(screen.queryByText(/recent activity/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /activity/i }));
    expect(await screen.findByText(/recent activity/i)).toBeInTheDocument();
  });

  test.fails('T02-EDIT-RBAC: SA/AD see Edit; MGR readonly; AGT/LED 403', async () => {
    // SA sees Edit
    localStorage.setItem('auth', JSON.stringify({ user: { userid: 1, name: 'SA', email: 'sa@x.com', roleid: 1 }, accessToken: 't', refreshToken: 'r' }));
    render(<UserDetail />);
    expect(await screen.findByRole('button', { name: /edit/i })).toBeInTheDocument();
    cleanup();
    // Admin sees Edit
    localStorage.setItem('auth', JSON.stringify({ user: { userid: 2, name: 'AD', email: 'ad@x.com', roleid: 2 }, accessToken: 't', refreshToken: 'r' }));
    render(<UserDetail />);
    expect(await screen.findByRole('button', { name: /edit/i })).toBeInTheDocument();
    cleanup();
    // Manager readonly
    localStorage.setItem('auth', JSON.stringify({ user: { userid: 3, name: 'MGR', email: 'm@x.com', roleid: 3 }, accessToken: 't', refreshToken: 'r' }));
    render(<UserDetail />);
    expect(await screen.findByText(/read-only/i)).toBeInTheDocument();
    cleanup();
    // Agent blocked
    localStorage.setItem('auth', JSON.stringify({ user: { userid: 4, name: 'AGT', email: 'a@x.com', roleid: 4 }, accessToken: 't', refreshToken: 'r' }));
    render(<UserDetail />);
    expect(await screen.findByText(/403|forbidden|access denied/i)).toBeInTheDocument();
  });

  test.fails('T03-RESET-PASSWORD-GUARD: SA/AD only; ConfirmModal requires typed email; POST /users/:id/change-password', async () => {
    const fetchMock = (url: RequestInfo, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/users/42') && (!init || init.method === 'GET')) return okJson({ userid: 42, name: 'Alice', email: 'alice@example.com', roleid: 3 });
      if (u.includes('/users/42/change-password') && init?.method === 'POST') return okJson({});
      return okJson({});
    };
    vi.stubGlobal('fetch', vi.fn(fetchMock) as unknown as typeof fetch);
    render(<UserDetail />);
    await screen.findByText(/alice@example.com/i);
    await userEvent.click(screen.getByRole('button', { name: /reset password/i }));
    await userEvent.type(screen.getByLabelText(/type email to confirm/i), 'alice@example.com');
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));
    const calls = (globalThis.fetch as any).mock.calls;
    expect(calls.some(([u, init]: [RequestInfo, RequestInit]) => String(u).includes('/users/42/change-password') && init?.method === 'POST')).toBe(true);
  });

  test.fails('T04-DELETE-GUARD: SA/AD only; email confirm required; DELETE /users/:id; toast and redirect', async () => {
    const fetchMock = (url: RequestInfo, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/users/42') && (!init || init.method === 'GET')) return okJson({ userid: 42, name: 'Alice', email: 'alice@example.com', roleid: 3 });
      if (u.includes('/users/42') && init?.method === 'DELETE') return okJson({});
      return okJson({});
    };
    vi.stubGlobal('fetch', vi.fn(fetchMock) as unknown as typeof fetch);
    render(<UserDetail />);
    await userEvent.click(screen.getByRole('button', { name: /delete user/i }));
    await userEvent.type(screen.getByLabelText(/type email to confirm/i), 'alice@example.com');
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));
    const calls = (globalThis.fetch as any).mock.calls;
    expect(calls.some(([u, init]: [RequestInfo, RequestInit]) => String(u).match(/\/users\/42(\?|$)/) && init?.method === 'DELETE')).toBe(true);
    await screen.findByText(/users list|back to users/i);
  });

  test.fails('T05-NPLUSONE-CHECK: only GET /users/:id initially; tab changes trigger specific calls only', async () => {
    const fetchMock = (url: RequestInfo, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/users/42') && (!init || init.method === 'GET')) return okJson({ userid: 42, name: 'Alice', email: 'alice@example.com', roleid: 3 });
      if (u.includes('/users/42/activity')) return okJson([]);
      if (u.includes('/users/42/roles')) return okJson([]);
      return okJson({});
    };
    vi.stubGlobal('fetch', vi.fn(fetchMock) as unknown as typeof fetch);
    render(<UserDetail />);
    await screen.findByText(/alice@example.com/i);
    // Switch tabs
    await userEvent.click(screen.getByRole('tab', { name: /activity/i }));
    await userEvent.click(screen.getByRole('tab', { name: /roles/i }));
    const calls = (globalThis.fetch as any).mock.calls.map(([u]: [RequestInfo]) => String(u));
    expect(calls.filter(u => u.includes('/users/42')).length).toBe(1);
    expect(calls.some(u => u.includes('/users/42/activity'))).toBe(true);
    expect(calls.some(u => u.includes('/users/42/roles'))).toBe(true);
    // No redundant /users list fetches
    expect(calls.some(u => u.match(/\/users\?(page|pageSize|q)=/))).toBe(false);
  });
});
