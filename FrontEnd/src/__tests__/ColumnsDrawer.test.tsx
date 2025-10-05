import { beforeAll, afterAll, afterEach, describe, expect, test, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import Leads from '../pages/Leads';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../hooks/useAuth';
import { RoleAccessProvider } from '../hooks/useRoleAccess';
import { NotificationProvider } from '../hooks/useNotifications';

vi.mock('../components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const okJson = (data: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response);

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

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

function mountLeadsWithDrawer(roleid = 1) {
  const fetchMock = (url: RequestInfo, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/assignable-users')) return okJson([]);
    if (u.includes('/columns') && (!init || init.method === 'GET')) return okJson([{ id: 1, title: 'status' }]);
    if (u.includes('/crm-leads') && (!init || init.method === 'GET')) return okJson([]);
    return okJson({});
  };
  vi.stubGlobal('fetch', vi.fn(fetchMock) as unknown as typeof fetch);
  localStorage.setItem('auth', JSON.stringify({ user: { userid: 1, name: 'User', email: 'u@x.com', roleid }, accessToken: 't', refreshToken: 'r' }));
  return render(
    <AuthProvider>
      <RoleAccessProvider>
        <NotificationProvider>
          <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Leads />
          </MemoryRouter>
        </NotificationProvider>
      </RoleAccessProvider>
    </AuthProvider>
  );
}

describe('11 – Columns Management: per-user & admin global presets', () => {
  test.fails('T01-OPEN-DRAWER-FROM-LEADS: clicking Manage Columns opens drawer and GET /columns', async () => {
    mountLeadsWithDrawer(1);
    // Click Manage Columns in the Leads UI
    await userEvent.click(screen.getByRole('button', { name: /manage columns/i }));
    // Drawer open and columns loaded
    await screen.findByRole('dialog');
    await screen.findByText(/status/i);
  });

  test.fails('T02-PERSONAL-PRESET-NONADMIN: non-admin can save personal preset; no global controls', async () => {
    mountLeadsWithDrawer(4); // Agent
    await userEvent.click(screen.getByRole('button', { name: /manage columns/i }));
    await screen.findByRole('dialog');
    expect(screen.getByRole('button', { name: /save personal preset/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save global preset/i })).not.toBeInTheDocument();
  });

  test.fails('T03-GLOBAL-PRESET-ADMIN: SA/AD can create/delete Global preset; delete confirm modal', async () => {
    mountLeadsWithDrawer(1);
    await userEvent.click(screen.getByRole('button', { name: /manage columns/i }));
    await screen.findByRole('dialog');
    await userEvent.click(screen.getByRole('button', { name: /save global preset/i }));
    await userEvent.click(screen.getByRole('button', { name: /delete global preset/i }));
    await screen.findByText(/this will affect all users/i);
  });

  test.fails('T04-CACHE-REOPEN-INSTANT: re-open drawer reads from cache without new /columns call within stale time', async () => {
    const fetchSpy = vi.spyOn(globalThis as any, 'fetch');
    mountLeadsWithDrawer(1);
    await userEvent.click(screen.getByRole('button', { name: /manage columns/i }));
    await screen.findByRole('dialog');
    // Close and reopen quickly
    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    await userEvent.click(screen.getByRole('button', { name: /manage columns/i }));
    // Expect no additional GET /columns (still 1 total call)
    const calls = fetchSpy.mock.calls.map(([u]: [RequestInfo]) => String(u)).filter(u => u.includes('/columns'));
    expect(calls.length).toBe(1);
  });
});
