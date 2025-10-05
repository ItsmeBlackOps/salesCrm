import { beforeAll, afterAll, afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import * as useAuthModule from '../hooks/useAuth';
import UserManagement from '../pages/UserManagement';

vi.mock('../hooks/useAuth');

vi.mock('../components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../hooks/use-mobile', () => ({ useIsMobile: () => false }));

type User = { userid: number; name: string; email: string; roleid: number; status?: string; lastlogin?: string };
type Role = { roleid: number; name: string; parentroleid: number | null };

const roles: Role[] = [
  { roleid: 1, name: 'SA', parentroleid: null },
  { roleid: 2, name: 'AD', parentroleid: 1 },
  { roleid: 3, name: 'MGR', parentroleid: 2 },
  { roleid: 4, name: 'AGT', parentroleid: 3 },
  { roleid: 5, name: 'LED', parentroleid: 4 },
];

function okJson(data: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response);
}

function errJson(status = 400, data: unknown = {}) {
  return Promise.resolve({ ok: false, status, json: () => Promise.resolve(data) } as Response);
}

const mockFetchWithAuth = vi.fn();

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
  // Stub ResizeObserver required by radix select/dialog in JSDOM
  // @ts-ignore
  vi.stubGlobal('ResizeObserver', class { observe(){} unobserve(){} disconnect(){} });
});

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  mockFetchWithAuth.mockImplementation((url: RequestInfo, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/roles')) return okJson(roles);
    if (u.includes('/users')) return okJson({ items: [], nextCursor: null, total: 0 });
    return okJson({});
  });
});

afterEach(() => {
  cleanup();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

function renderUsersList(userRoleId: number, users: User[] = []) {
  mockFetchWithAuth.mockImplementation((url: RequestInfo, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/roles')) return okJson(roles);
    if (u.includes('/users')) {
      // Reflect query params in response for tests when needed
      const qp = new URLSearchParams(u.split('?')[1] || '');
      const q = qp.get('q');
      const roleParam = qp.get('role');
      const statusParam = qp.get('status');
      let items = users;
      if (q) items = items.filter(it => it.name.toLowerCase().includes(q.toLowerCase()) || it.email.toLowerCase().includes(q.toLowerCase()));
      if (roleParam) items = items.filter(it => String(it.roleid) === roleParam);
      if (statusParam) items = items.filter(it => (it.status || '').toLowerCase() === statusParam.toLowerCase());
      return okJson({ items, nextCursor: null, total: items.length });
    }
    return okJson({});
  });

  (useAuthModule.useAuth as any).mockReturnValue({
    user: { userid: 99, name: 'Current', email: 'me@example.com', roleid: userRoleId },
    fetchWithAuth: mockFetchWithAuth,
  });

  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <UserManagement />
    </MemoryRouter>
  );
}

describe('04 – Users List', () => {
  it('T01-USERS-RBAC-VISIBILITY: SA/AD see table; MGR read-only; AGT/LED see 403', async () => {
    // SA: table visible with create button
    renderUsersList(1, []);
    expect(await screen.findByText(/user management/i)).toBeInTheDocument();
    expect(screen.getByText(/users/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new user/i })).toBeInTheDocument();
    cleanup();

    // AD: table visible with create button
    renderUsersList(2, []);
    expect(await screen.findByText(/user management/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new user/i })).toBeInTheDocument();
    cleanup();

    // MGR: table visible but read-only (no New User / no row actions)
    renderUsersList(3, [{ userid: 1, name: 'A', email: 'a@x.com', roleid: 4, status: 'active' }]);
    expect(await screen.findByText(/users/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new user/i })).not.toBeInTheDocument();
    // No Edit/Delete action trigger visible
    expect(screen.queryByText(/edit/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/delete/i)).not.toBeInTheDocument();
    cleanup();

    // AGT: should see 403/forbidden card instead of table
    renderUsersList(4, []);
    expect(await screen.findByText(/403|forbidden|access denied/i)).toBeInTheDocument();
    cleanup();

    // LED: also forbidden
    renderUsersList(5, []);
    expect(await screen.findByText(/403|forbidden|access denied/i)).toBeInTheDocument();
  });

  it('T02-USERS-PAGINATION-SERVER: calls /users?page=&pageSize= and preserves filters', async () => {
    const users: User[] = Array.from({ length: 5 }, (_, i) => ({ userid: i + 1, name: `U${i+1}` , email: `u${i+1}@x.com`, roleid: 4, status: 'active' }));
    renderUsersList(1, users);
    await screen.findByText(/users/i);

    // Set a search filter so we can assert it's preserved
    const search = screen.getByPlaceholderText(/search users/i);
    await userEvent.type(search, 'john');

    // Interact with pagination controls (to be implemented by devs)
    const pageSize = screen.getByRole('combobox', { name: /rows per page/i });
    await userEvent.click(pageSize);
    await userEvent.click(await screen.findByRole('option', { name: /25/i }));
    await userEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(mockFetchWithAuth).toHaveBeenCalledWith(
      expect.stringMatching(/\/users\?.*page=2.*pageSize=25.*q=john/),
      expect.any(Object)
    );
  });

  it('T03-USERS-SEARCH-DEBOUNCE: debounces 300ms and issues one call with q', async () => {
    vi.useFakeTimers();
    renderUsersList(1, [
      { userid: 1, name: 'John Smith', email: 'john@example.com', roleid: 4, status: 'active' },
      { userid: 2, name: 'Jane Doe', email: 'jane@example.com', roleid: 4, status: 'inactive' },
    ]);
    await screen.findByText(/users/i);

    const search = screen.getByPlaceholderText(/search users/i);
    await userEvent.type(search, 'john');
    // Advance debounce window
    vi.advanceTimersByTime(300);

    // Only one call containing q=john (in addition to initial load)
    const calls = mockFetchWithAuth.mock.calls.filter(([u]) => String(u).includes('/users'));
    const qCalls = calls.filter(([u]) => String(u).includes('q=john'));
    expect(qCalls.length).toBe(1);
    vi.useRealTimers();
  });

  it('T04-USERS-FILTERS-ROLE-STATUS: applies filters to query and updates table', async () => {
    const all: User[] = [
      { userid: 1, name: 'John Smith', email: 'john@example.com', roleid: 4, status: 'active' },
      { userid: 2, name: 'Mary Manager', email: 'mary@example.com', roleid: 3, status: 'inactive' },
    ];
    renderUsersList(1, all);
    await screen.findByText(/users/i);

    // Interact with role/status filters (to be implemented in Filters.tsx)
    const roleFilter = screen.getByRole('combobox', { name: /role/i });
    await userEvent.click(roleFilter);
    await userEvent.click(await screen.findByRole('option', { name: /manager/i }));

    const statusFilter = screen.getByRole('combobox', { name: /status/i });
    await userEvent.click(statusFilter);
    await userEvent.click(await screen.findByRole('option', { name: /inactive/i }));

    // Expect query params include role and status
    expect(mockFetchWithAuth).toHaveBeenCalledWith(
      expect.stringMatching(/\/users\?.*(role|roleId)=3.*status=inactive/),
      expect.any(Object)
    );

    // Table should update to show only Mary Manager
    expect(await screen.findByText(/mary manager/i)).toBeInTheDocument();
    expect(screen.queryByText(/john smith/i)).not.toBeInTheDocument();
  });

  it('T05-USERS-SCOPE-BADGE: shows "all" for SA/AD and "team" for MGR', async () => {
    renderUsersList(1, []);
    expect(await screen.findByText(/scope:\s*all/i)).toBeInTheDocument();
    cleanup();

    renderUsersList(2, []);
    expect(await screen.findByText(/scope:\s*all/i)).toBeInTheDocument();
    cleanup();

    renderUsersList(3, []);
    expect(await screen.findByText(/scope:\s*team/i)).toBeInTheDocument();
  });

  it('T06-USERS-ERROR-EMPTY-SKELETON: loading -> skeleton; 200 empty -> empty; 403 -> Empty403', async () => {
    // Skeleton while loading
    const deferred: { resolve?: (v: unknown) => void } = {};
    mockFetchWithAuth.mockImplementation((url: RequestInfo) => {
      const u = String(url);
      if (u.includes('/roles')) return okJson(roles);
      if (u.includes('/users')) {
        return new Promise<Response>((res) => {
          deferred.resolve = (v) => res(v as Response);
        });
      }
      return okJson({});
    });
    (useAuthModule.useAuth as any).mockReturnValue({ user: { userid: 99, name: 'X', email: 'x@x.com', roleid: 1 }, fetchWithAuth: mockFetchWithAuth });
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <UserManagement />
      </MemoryRouter>
    );
    // Expect a loading indicator/skeleton
    expect(await screen.findByText(/loading/i)).toBeInTheDocument();

    // Resolve with empty -> empty state
    deferred.resolve?.(okJson({ items: [], nextCursor: null, total: 0 }) as unknown as Response);
    expect(await screen.findByText(/no users|empty/i)).toBeInTheDocument();

    // Now simulate 403 -> show Empty403 card
    cleanup();
    mockFetchWithAuth.mockImplementation((url: RequestInfo) => {
      const u = String(url);
      if (u.includes('/roles')) return okJson(roles);
      if (u.includes('/users')) return errJson(403, { message: 'Forbidden' });
      return okJson({});
    });
    (useAuthModule.useAuth as any).mockReturnValue({ user: { userid: 99, name: 'X', email: 'x@x.com', roleid: 1 }, fetchWithAuth: mockFetchWithAuth });
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <UserManagement />
      </MemoryRouter>
    );
    expect(await screen.findByText(/403|forbidden|access denied/i)).toBeInTheDocument();
  });
});
