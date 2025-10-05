import { beforeAll, afterAll, afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Clients from '../pages/Clients';
import ClientDetail from '../pages/ClientDetail';

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

describe('10 – Clients: list & detail (scope parity + Origin Lead link)', () => {
  test.fails('T01-CLIENTS-RBAC-PARITY: scope rules match Leads across roles', async () => {
    const fetchMock = (url: RequestInfo, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/role-access') && (!init || init.method === 'GET')) return okJson({ clients: { '1': true, '2': true, '3': true, '4': true, '5': false } });
      if (u.includes('/clients') && (!init || init.method === 'GET')) return okJson({ items: [], total: 0 });
      return okJson({});
    };
    vi.stubGlobal('fetch', vi.fn(fetchMock) as unknown as typeof fetch);
    render(
      <MemoryRouter initialEntries={["/clients"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/clients" element={<Clients />} />
          <Route path="/" element={<div>Home</div>} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText(/clients/i)).toBeInTheDocument();
    cleanup();
    // LED (5) blocked
    localStorage.setItem('auth', JSON.stringify({ user: { userid: 5, name: 'LED', email: 'l@x.com', roleid: 5 }, accessToken: 't', refreshToken: 'r' }));
    render(
      <MemoryRouter initialEntries={["/clients"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/clients" element={<Clients />} />
          <Route path="/" element={<div>Home</div>} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText(/403|forbidden|access denied/i)).toBeInTheDocument();
  });

  test.fails('T02-ORIGIN-LEAD-LINK: client detail shows link to origin lead → /leads/:id', async () => {
    const fetchMock = (url: RequestInfo, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/clients/101') && (!init || init.method === 'GET')) return okJson({ id: 101, name: 'Acme Ltd', origin_lead_id: 44 });
      return okJson({});
    };
    vi.stubGlobal('fetch', vi.fn(fetchMock) as unknown as typeof fetch);
    render(
      <MemoryRouter initialEntries={["/clients/101"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/clients/:id" element={<ClientDetail />} />
          <Route path="/leads/44" element={<div>Lead 44</div>} />
        </Routes>
      </MemoryRouter>
    );
    const link = await screen.findByRole('link', { name: /origin lead/i });
    await userEvent.click(link);
    await screen.findByText(/lead 44/i);
  });

  test.fails('T03-CREATE-FROM-LEAD-GATED: MGR/AD/SA visible; AGT/LED hidden on LeadDetails', async () => {
    // SA should see Create Client on lead detail
    localStorage.setItem('auth', JSON.stringify({ user: { userid: 1, name: 'SA', email: 'sa@x.com', roleid: 1 }, accessToken: 't', refreshToken: 'r' }));
    render(
      <MemoryRouter>
        <div id="lead-detail">
          {/* Implementers: button should be rendered for SA/AD/MGR only */}
        </div>
      </MemoryRouter>
    );
    // Expect a button named Create Client (not present in stub -> throws)
    await screen.findByRole('button', { name: /create client/i });
  });

  test.fails('T04-PAGINATION-FILTERS: clients pagination + filters call server like Leads', async () => {
    const calls: string[] = [];
    const fetchMock = (url: RequestInfo, init?: RequestInit) => {
      const u = String(url);
      calls.push(u);
      if (u.includes('/clients') && (!init || init.method === 'GET')) return okJson({ items: [], total: 0 });
      return okJson({});
    };
    vi.stubGlobal('fetch', vi.fn(fetchMock) as unknown as typeof fetch);
    render(
      <MemoryRouter initialEntries={["/clients"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Clients />
      </MemoryRouter>
    );
    // Interact with hypothetical filter & pagination controls
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    await userEvent.click(screen.getByRole('combobox', { name: /rows per page/i }));
    await userEvent.click(await screen.findByRole('option', { name: /50/i }));
    await userEvent.type(screen.getByPlaceholderText(/search clients/i), 'acme');
    expect(calls.some(u => u.match(/\/clients\?.*(page|pageSize|q)=/))).toBe(true);
  });
});
