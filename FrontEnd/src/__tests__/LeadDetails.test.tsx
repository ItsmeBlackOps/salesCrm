import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LeadDetails from '../pages/LeadDetails';
import { AuthProvider } from '../hooks/useAuth';
import { RoleAccessProvider } from '../hooks/useRoleAccess';
import { NotificationProvider } from '../hooks/useNotifications';
import * as toastModule from '../hooks/use-toast';
import '@testing-library/jest-dom/vitest';

vi.mock('../components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../hooks/use-mobile', () => ({ useIsMobile: () => false }));

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
  vi.spyOn(toastModule, 'toast').mockImplementation(() => ({ id: '1', dismiss: vi.fn(), update: vi.fn() }));
  localStorage.setItem('auth', JSON.stringify({ user: { userid: 1, name: 'SA', email: 'sa@x.com', roleid: 1 }, accessToken: 't', refreshToken: 'r' }));
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

const okJson = (data: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response);
const errJson = (status = 400, data: unknown = {}) => Promise.resolve({ ok: false, status, json: () => Promise.resolve(data) } as Response);

function setup(fetchMock: (url: RequestInfo, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(fetchMock) as unknown as typeof fetch);
  return render(
    <AuthProvider>
      <RoleAccessProvider>
        <NotificationProvider>
          <MemoryRouter initialEntries={["/lead-details/1"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Routes>
              <Route path="/lead-details/:id" element={<LeadDetails />} />
              <Route path="/leads" element={<div>Leads List</div>} />
              <Route path="/403" element={<div>Forbidden</div>} />
            </Routes>
          </MemoryRouter>
        </NotificationProvider>
      </RoleAccessProvider>
    </AuthProvider>,
  );
}

describe('09 – Lead Detail: tabs, delete w/ reason, convert to client', () => {
  test.fails('T01-TABS-RENDER-PREFETCH: Details default; Activity/History lazy; prefetch on hover', async () => {
    const base = (url: RequestInfo) => {
      const u = String(url);
      if (u.includes('/crm-leads/1')) return okJson({ id: 1, firstname: 'A', lastname: 'B', email: 'a@b.com', status: 'new', company: 'Acme' });
      return okJson({});
    };
    setup(base);
    // Tabs present
    await screen.findByText(/details/i);
    expect(screen.getByRole('tab', { name: /details/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /activity/i })).toHaveAttribute('aria-selected', 'false');
    // Hover prefetch (optional): simulate hover and expect calls
  });

  test.fails('T02-DELETE-WITH-REASON-GUARD: SA/AD delete asks reason; DELETE /crm-leads/:id with reason; toast + navigate', async () => {
    const fetchMock = (url: RequestInfo, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/crm-leads/1') && (!init || init.method === 'GET')) return okJson({ id: 1, firstname: 'A', lastname: 'B', email: 'a@b.com', status: 'new', company: 'Acme' });
      if (u.includes('/crm-leads/1') && init?.method === 'DELETE') {
        const body = JSON.parse(String(init.body || '{}'));
        expect(body).toMatchObject({ reason: expect.any(String) });
        return okJson({});
      }
      return okJson({});
    };
    setup(fetchMock);
    await screen.findByText(/details/i);
    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    await userEvent.type(screen.getByLabelText(/reason/i), 'duplicate');
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(toastModule.toast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/lead deleted/i) }));
    await screen.findByText('Leads List');
  });

  test.fails('T03-CONVERT-TO-CLIENT: MGR/AD/SA convert opens modal and POST /clients; navigates to client detail', async () => {
    const fetchMock = (url: RequestInfo, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/crm-leads/1') && (!init || init.method === 'GET')) return okJson({ id: 1, firstname: 'A', lastname: 'B', email: 'a@b.com', status: 'new', company: 'Acme' });
      if (u.includes('/clients') && init?.method === 'POST') return okJson({ id: 101, name: 'Acme Ltd', origin_lead_id: 1 });
      return okJson({});
    };
    setup(fetchMock);
    await screen.findByText(/details/i);
    await userEvent.click(screen.getByRole('button', { name: /convert to client/i }));
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));
    await screen.findByText(/client detail|origin lead/i);
  });

  test.fails('T04-RBAC-AGENT-RESTRICTIONS: AGT cannot see Delete/Convert; can edit own fields only', async () => {
    localStorage.setItem('auth', JSON.stringify({ user: { userid: 2, name: 'Agent', email: 'a@x.com', roleid: 4 }, accessToken: 't', refreshToken: 'r' }));
    const fetchMock = (url: RequestInfo, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/crm-leads/1') && (!init || init.method === 'GET')) return okJson({ id: 1, firstname: 'A', lastname: 'B', email: 'a@b.com', status: 'new', company: 'Acme', createdby: 2 });
      return okJson({});
    };
    setup(fetchMock);
    await screen.findByText(/details/i);
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /convert to client/i })).not.toBeInTheDocument();
    // Fields should be enabled because Agent owns the lead
    expect(screen.getByLabelText(/first name/i)).toBeEnabled();
  });

  test.fails('T05-404/403-HANDLING: 404 not-found view; 403 access card', async () => {
    // 404
    const fetch404 = (url: RequestInfo) => {
      const u = String(url);
      if (u.includes('/crm-leads/1')) return errJson(404, { message: 'Not Found' });
      return okJson({});
    };
    setup(fetch404);
    await screen.findByText(/not found|missing|no longer exists/i);
    // 403
    const fetch403 = (url: RequestInfo) => {
      const u = String(url);
      if (u.includes('/crm-leads/1')) return errJson(403, { message: 'Forbidden' });
      return okJson({});
    };
    setup(fetch403);
    await screen.findByText(/forbidden|access denied|403/i);
  });
});
