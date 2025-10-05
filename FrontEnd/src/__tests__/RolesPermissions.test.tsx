import { beforeAll, afterAll, afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import Roles from '../pages/Roles';
import RolePermissions from '../pages/RolePermissions';

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
  // @ts-ignore
  vi.stubGlobal('ResizeObserver', class { observe(){} unobserve(){} disconnect(){} });
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

function mountRoles(roleid: number, routes: { roles?: unknown; permissions?: unknown } = {}) {
  const fetchMock = (url: RequestInfo, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/roles') && (!init || init.method === 'GET')) return okJson(routes.roles ?? [{ roleid: 1, name: 'SA' }, { roleid: 2, name: 'AD' }, { roleid: 3, name: 'MGR' }]);
    if (u.includes('/role-permissions') && (!init || init.method === 'GET')) return okJson(routes.permissions ?? { SA: { leads: true } });
    return okJson({});
  };
  vi.stubGlobal('fetch', vi.fn(fetchMock) as unknown as typeof fetch);
  localStorage.setItem('auth', JSON.stringify({ user: { userid: 1, name: 'User', email: 'u@x.com', roleid }, accessToken: 't', refreshToken: 'r' }));
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Roles />
    </MemoryRouter>
  );
}

describe('06 – Roles & Role Permissions (SA-only edit + preview)', () => {
  test.fails('T01-ROLES-LIST-VISIBLE: SA/AD can open /roles; others 403', async () => {
    // SA can see list
    mountRoles(1);
    expect(await screen.findByText(/roles|role list/i)).toBeInTheDocument();
    cleanup();
    // Admin can see list
    mountRoles(2);
    expect(await screen.findByText(/roles|role list/i)).toBeInTheDocument();
    cleanup();
    // MGR/AGT/LED blocked
    mountRoles(3);
    expect(await screen.findByText(/403|forbidden|access denied/i)).toBeInTheDocument();
    cleanup();
    mountRoles(4);
    expect(await screen.findByText(/403|forbidden|access denied/i)).toBeInTheDocument();
  });

  test.fails('T02-ROLE-DETAIL-MATRIX: Admin read-only (no Save); SA sees Edit/Save', async () => {
    const routeData = {
      roles: [ { roleid: 1, name: 'SA' }, { roleid: 2, name: 'AD' }, { roleid: 3, name: 'MGR' } ],
      permissions: { dashboard: { '1': true, '2': true, '3': false }, leads: { '1': true, '2': true, '3': true } },
    };
    // SA path
    const fetchMockSA = (url: RequestInfo, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/roles')) return okJson(routeData.roles);
      if (u.includes('/role-permissions') && (!init || init.method === 'GET')) return okJson(routeData.permissions);
      if (u.includes('/role-permissions') && init?.method === 'PUT') return okJson({});
      return okJson({});
    };
    vi.stubGlobal('fetch', vi.fn(fetchMockSA) as unknown as typeof fetch);
    localStorage.setItem('auth', JSON.stringify({ user: { userid: 1, name: 'SA', email: 'sa@x.com', roleid: 1 }, accessToken: 't', refreshToken: 'r' }));
    render(<RolePermissions />);
    await screen.findByText(/permissions|matrix/i);
    const saveBtn = screen.getByRole('button', { name: /save/i });
    expect(saveBtn).toBeEnabled();
    cleanup();

    // Admin path
    const fetchMockAD = (url: RequestInfo, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/roles')) return okJson(routeData.roles);
      if (u.includes('/role-permissions') && (!init || init.method === 'GET')) return okJson(routeData.permissions);
      return okJson({});
    };
    vi.stubGlobal('fetch', vi.fn(fetchMockAD) as unknown as typeof fetch);
    localStorage.setItem('auth', JSON.stringify({ user: { userid: 2, name: 'AD', email: 'ad@x.com', roleid: 2 }, accessToken: 't', refreshToken: 'r' }));
    render(<RolePermissions />);
    await screen.findByText(/permissions|matrix/i);
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
  });

  test.fails('T03-PREVIEW-PERSONA: opening preview does not mutate server (no PUT)', async () => {
    const fetchMock = (url: RequestInfo, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/roles')) return okJson([{ roleid: 1, name: 'SA' }, { roleid: 2, name: 'AD' }]);
      if (u.includes('/role-permissions') && (!init || init.method === 'GET')) return okJson({ dashboard: { '1': true, '2': true } });
      if (init?.method === 'PUT') return errJson(500); // should not happen during preview
      return okJson({});
    };
    vi.stubGlobal('fetch', vi.fn(fetchMock) as unknown as typeof fetch);
    render(<RolePermissions />);
    await screen.findByText(/permissions|matrix/i);
    await userEvent.click(screen.getByRole('button', { name: /preview/i }));
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: /role/i }), 'AD');
    // Assert no PUT calls
    const calls = (globalThis.fetch as any).mock.calls;
    expect(calls.filter(([, init]) => (init?.method === 'PUT')).length).toBe(0);
  });

  test.fails('T04-CRITICAL-PERMS-BLOCK: removing SA critical perms blocked; validation shown; no PUT', async () => {
    const fetchMock = (url: RequestInfo, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/roles')) return okJson([{ roleid: 1, name: 'SA' }]);
      if (u.includes('/role-permissions') && (!init || init.method === 'GET')) return okJson({ dashboard: { '1': true } });
      if (init?.method === 'PUT') return okJson({});
      return okJson({});
    };
    vi.stubGlobal('fetch', vi.fn(fetchMock) as unknown as typeof fetch);
    render(<RolePermissions />);
    await screen.findByText(/permissions|matrix/i);
    // Attempt to uncheck a critical SA permission
    const checks = screen.getAllByRole('checkbox');
    await userEvent.click(checks[0]);
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByText(/cannot remove critical permissions/i)).toBeInTheDocument();
    const calls = (globalThis.fetch as any).mock.calls;
    expect(calls.filter(([, init]) => (init?.method === 'PUT')).length).toBe(0);
  });

  test.fails('T05-SAVE-DIFF-SUMMARY: PUT only changes; diff summary rendered', async () => {
    const fetchMock = (url: RequestInfo, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/roles')) return okJson([{ roleid: 1, name: 'SA' }]);
      if (u.includes('/role-permissions') && (!init || init.method === 'GET')) return okJson({ dashboard: { '1': false }, leads: { '1': true } });
      if (u.includes('/role-permissions') && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body || '{}'));
        expect(body).toEqual({ dashboard: { '1': true } }); // only changed entry
        return okJson({});
      }
      return okJson({});
    };
    vi.stubGlobal('fetch', vi.fn(fetchMock) as unknown as typeof fetch);
    render(<RolePermissions />);
    await screen.findByText(/permissions|matrix/i);
    // Toggle one permission to changed
    const chk = screen.getAllByRole('checkbox')[0];
    await userEvent.click(chk);
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    await screen.findByText(/changes:\s*1/i);
  });
});
