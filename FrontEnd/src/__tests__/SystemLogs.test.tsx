import { beforeAll, afterAll, afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import Logs from '../pages/Logs';
import PermissionHistory from '../pages/PermissionHistory';

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

describe('12 – Logs & Permission History: read-only, filters, masked PII', () => {
  test.fails('T01-RBAC-VISIBILITY: SA full; AD masked; others 403', async () => {
    const fetchMock = (url: RequestInfo) => {
      const u = String(url);
      if (u.includes('/logs')) return okJson([{ id: 1, actor: 'SA', action: 'DELETE', details: 'email=alice@example.com' }]);
      return okJson({});
    };
    vi.stubGlobal('fetch', vi.fn(fetchMock) as unknown as typeof fetch);
    // SA
    localStorage.setItem('auth', JSON.stringify({ user: { userid: 1, name: 'SA', email: 'sa@x.com', roleid: 1 }, accessToken: 't', refreshToken: 'r' }));
    render(<MemoryRouter><Logs /></MemoryRouter>);
    expect(await screen.findByText(/alice@example.com/i)).toBeInTheDocument();
    cleanup();
    // AD masked
    localStorage.setItem('auth', JSON.stringify({ user: { userid: 2, name: 'AD', email: 'ad@x.com', roleid: 2 }, accessToken: 't', refreshToken: 'r' }));
    render(<MemoryRouter><Logs /></MemoryRouter>);
    expect(await screen.findByText(/alice\*\*\*@example\.com/i)).toBeInTheDocument();
    cleanup();
    // Others 403
    localStorage.setItem('auth', JSON.stringify({ user: { userid: 3, name: 'MGR', email: 'm@x.com', roleid: 3 }, accessToken: 't', refreshToken: 'r' }));
    render(<MemoryRouter><Logs /></MemoryRouter>);
    expect(await screen.findByText(/403|forbidden|access denied/i)).toBeInTheDocument();
  });

  test.fails('T02-FILTERS-SERVER-SIDE: time range, actor, action -> server called with filters', async () => {
    const calls: string[] = [];
    const fetchMock = (url: RequestInfo) => {
      const u = String(url);
      calls.push(u);
      if (u.includes('/logs')) return okJson([]);
      return okJson({});
    };
    vi.stubGlobal('fetch', vi.fn(fetchMock) as unknown as typeof fetch);
    render(<MemoryRouter><Logs /></MemoryRouter>);
    // Simulate filters UI
    await userEvent.type(screen.getByLabelText(/from/i), '2025-01-01');
    await userEvent.type(screen.getByLabelText(/to/i), '2025-01-31');
    await userEvent.type(screen.getByLabelText(/actor/i), 'alice');
    await userEvent.selectOptions(screen.getByLabelText(/action/i), 'DELETE');
    await userEvent.click(screen.getByRole('button', { name: /apply/i }));
    expect(calls.some(u => u.match(/\/logs\?.*from=2025-01-01.*to=2025-01-31.*actor=alice.*action=DELETE/))).toBe(true);
  });

  test.fails('T03-SIDE-PANEL-DETAILS: click row opens panel; no secrets rendered', async () => {
    const fetchMock = (url: RequestInfo) => {
      const u = String(url);
      if (u.includes('/logs')) return okJson([{ id: 1, actor: 'SA', action: 'UPDATE', details: 'DATABASE_URL=postgres://...' }]);
      return okJson({});
    };
    vi.stubGlobal('fetch', vi.fn(fetchMock) as unknown as typeof fetch);
    render(<MemoryRouter><Logs /></MemoryRouter>);
    await userEvent.click(await screen.findByRole('row', { name: /update/i }));
    // Side panel opens
    await screen.findByRole('dialog');
    // Should not render secrets
    expect(screen.queryByText(/DATABASE_URL|AWS_SECRET|PASSWORD=/i)).not.toBeInTheDocument();
  });

  test.fails('T04-VIRTUALIZATION-PERF: renders ~1000 rows without warnings', async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({ id: i + 1, actor: `A${i}`, action: 'VIEW', details: '' }));
    const fetchMock = (url: RequestInfo) => {
      const u = String(url);
      if (u.includes('/logs')) return okJson(rows);
      return okJson({});
    };
    vi.stubGlobal('fetch', vi.fn(fetchMock) as unknown as typeof fetch);
    render(<MemoryRouter><PermissionHistory /></MemoryRouter>);
    // Should render smoothly with virtualization and not flood the DOM
    expect(screen.getAllByRole('row').length).toBeLessThan(200);
  });
});
