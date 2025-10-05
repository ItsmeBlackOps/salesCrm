import { beforeAll, afterAll, afterEach, beforeEach, describe, it, expect, vi, test } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import RoleAccess from '../pages/RoleAccess';
import * as toastModule from '../hooks/use-toast';
import { AuthProvider } from '../hooks/useAuth';
import { RoleAccessProvider } from '../hooks/useRoleAccess';
import '@testing-library/jest-dom/vitest';

vi.mock('../components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../hooks/use-mobile', () => ({ useIsMobile: () => false }));

const okJson = (data: unknown) =>
  Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response);
const errJson = (status = 400, data: unknown = {}) =>
  Promise.resolve({ ok: false, status, json: () => Promise.resolve(data) } as Response);

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
  // Radix
  // @ts-ignore
  vi.stubGlobal('ResizeObserver', class { observe(){} unobserve(){} disconnect(){} });
});

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(toastModule, 'toast').mockImplementation(() => ({ id: '1', dismiss: vi.fn(), update: vi.fn() }));
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

function mountWithUser(roleid: number, fetchMock?: (url: RequestInfo, init?: RequestInit) => Promise<Response>) {
  const baseFetch = (url: RequestInfo, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/roles')) {
      return okJson([
        { roleid: 1, name: 'SA' },
        { roleid: 2, name: 'AD' },
        { roleid: 3, name: 'MGR' },
      ]);
    }
    if (u.includes('/role-access') && (!init || init.method === 'GET')) {
      return okJson({
        dashboard: { '1': true, '2': true, '3': true },
        roleaccess: { '1': true, '2': true, '3': false },
      });
    }
    if (u.includes('/role-access') && init?.method === 'POST') {
      return okJson({});
    }
    return okJson({});
  };
  vi.stubGlobal('fetch', vi.fn(fetchMock || baseFetch) as unknown as typeof fetch);
  localStorage.setItem(
    'auth',
    JSON.stringify({ user: { userid: 10, name: 'User', email: 'u@x.com', roleid }, accessToken: 't', refreshToken: 'r' }),
  );
  return render(
    <AuthProvider>
      <RoleAccessProvider>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <RoleAccess />
        </MemoryRouter>
      </RoleAccessProvider>
    </AuthProvider>,
  );
}

describe('07 – Role Access by Component (3-state grid, SA-only save)', () => {
  it('T01-GRID-VISIBLE-SA: SA sees Save and can toggle permissions', async () => {
    mountWithUser(1);
    expect(await screen.findByRole('heading', { name: /role access/i })).toBeInTheDocument();

    // Expect grid rendered with role headers
    expect(screen.getByText('SA')).toBeInTheDocument();
    expect(screen.getByText('AD')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();

    // Toggle a cell
    const checks = screen.getAllByRole('checkbox');
    expect(checks.length).toBeGreaterThan(0);
    await userEvent.click(checks[0]);
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    const mockAny = globalThis.fetch as any;
    expect(mockAny.mock.calls.some(([u, init]: [RequestInfo, RequestInit]) => String(u).includes('/role-access') && (init?.method === 'POST'))).toBe(true);
  });

  test.fails('T01-GRID-VISIBLE-ADMIN: Admin read-only; no Save button; cells disabled', async () => {
    mountWithUser(2);
    await screen.findByRole('heading', { name: /role access/i });
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
    const checks = screen.getAllByRole('checkbox');
    expect(checks.every((c) => (c as HTMLInputElement).disabled)).toBe(true);
  });

  test.fails('T02-CONDITIONAL-LOCKED: conditional cells show as locked (non-editable)', async () => {
    mountWithUser(1);
    await screen.findByRole('heading', { name: /role access/i });
    // Example: lock SA on critical components like 'dashboard'
    const row = screen.getByText(/dashboard/i).closest('tr')!;
    const cells = row.querySelectorAll('input[type="checkbox"]');
    expect((cells[0] as HTMLInputElement).disabled).toBe(true);
  });

  test.fails('T03-PREVIEW-DIFF: editing shows diff preview with old→new and counts', async () => {
    mountWithUser(1);
    await screen.findByText(/role access/i);
    // Open diff panel (to be implemented)
    await userEvent.click(screen.getByRole('button', { name: /preview diff/i }));
    await screen.findByText(/changes:\s*\d+/i);
    await screen.findByText(/dashboard.*sa.*false\s*→\s*true/i);
  });

  test.fails('T04-SAVE-SUMMARY-SA-ONLY: POST /role-access with diff; shows toast', async () => {
    const postSpy = vi.fn((url: RequestInfo, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/roles')) return okJson([{ roleid: 1, name: 'SA' }]);
      if (u.includes('/role-access') && (!init || init.method === 'GET')) {
        return okJson({ dashboard: { '1': false } });
      }
      if (u.includes('/role-access') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body || '{}'));
        // Expect diff payload like { dashboard: { '1': true } }
        expect(body).toEqual({ dashboard: { '1': true } });
        return okJson({});
      }
      return okJson({});
    });
    mountWithUser(1, postSpy);
    await screen.findByRole('heading', { name: /role access/i });
    const chk = screen.getAllByRole('checkbox')[0];
    await userEvent.click(chk);
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(toastModule.toast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/permissions updated/i) }));
  });

  test.fails('T05-ERROR-HANDLING-403/422: 403 read-only message; 422 validation errors inline', async () => {
    const fetchMock = (url: RequestInfo, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/roles')) return okJson([{ roleid: 1, name: 'SA' }]);
      if (u.includes('/role-access') && (!init || init.method === 'GET')) return okJson({ dashboard: { '1': true } });
      if (u.includes('/role-access') && init?.method === 'POST') return errJson(422, { message: 'Validation failed' });
      return okJson({});
    };
    mountWithUser(1, fetchMock);
    await screen.findByRole('heading', { name: /role access/i });
    await userEvent.click(screen.getAllByRole('checkbox')[0]);
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(toastModule.toast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/validation failed/i) }));
    // Switch to 403 path
    cleanup();
    const fetchMock403 = (url: RequestInfo, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/roles')) return okJson([{ roleid: 1, name: 'SA' }]);
      if (u.includes('/role-access') && (!init || init.method === 'GET')) return okJson({ dashboard: { '1': true } });
      if (u.includes('/role-access') && init?.method === 'POST') return errJson(403, { message: 'Forbidden' });
      return okJson({});
    };
    mountWithUser(1, fetchMock403);
    await screen.findByRole('heading', { name: /role access/i });
    await userEvent.click(screen.getAllByRole('checkbox')[0]);
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(toastModule.toast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/forbidden|read-only|no permission/i) }));
  });
});
