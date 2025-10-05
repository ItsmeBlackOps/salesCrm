import { beforeAll, afterAll, afterEach, describe, expect, test, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import { DepartmentsProvider } from '../DepartmentsProvider';
import { useDepartments } from '../hooks/useDepartments';

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

function DemoSelect() {
  const { departments, loading } = useDepartments();
  if (loading) return <div>Loading…</div>;
  return (
    <select aria-label="Department">
      {departments.map((d) => (
        <option key={d.id} value={d.id}>{d.name}</option>
      ))}
    </select>
  );
}

describe('13 – Departments: preload & cache', () => {
  test.fails('T01-PREFETCH-ON-AUTH: GET /departments cached under departments:list', async () => {
    const fetchMock = (url: RequestInfo) => {
      const u = String(url);
      if (u.includes('/departments')) return okJson([{ id: 1, name: 'Sales' }]);
      return okJson({});
    };
    vi.stubGlobal('fetch', vi.fn(fetchMock) as unknown as typeof fetch);
    render(
      <MemoryRouter>
        <DepartmentsProvider>
          <DemoSelect />
        </DepartmentsProvider>
      </MemoryRouter>
    );
    // Expect provider to prefetch on auth and cache list
    await screen.findByRole('option', { name: /sales/i });
  });

  test.fails('T02-FORMS-SKELETON-TO-OPTIONS: skeleton then options; no empty select after 1s', async () => {
    const fetchMock = () => okJson([{ id: 1, name: 'Sales' }]);
    vi.stubGlobal('fetch', vi.fn(fetchMock) as unknown as typeof fetch);
    render(<MemoryRouter><DepartmentsProvider><DemoSelect /></DepartmentsProvider></MemoryRouter>);
    // First shows loading state
    expect(await screen.findByText(/loading/i)).toBeInTheDocument();
    // Then shows options
    await screen.findByRole('option', { name: /sales/i });
  });

  test.fails('T03-CACHE-REUSE: navigating away/back uses cache (no new call within stale time)', async () => {
    const fetchSpy = vi.fn(() => okJson([{ id: 1, name: 'Sales' }]));
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);
    const { unmount } = render(<MemoryRouter><DepartmentsProvider><DemoSelect /></DepartmentsProvider></MemoryRouter>);
    await screen.findByRole('option', { name: /sales/i });
    unmount();
    render(<MemoryRouter><DepartmentsProvider><DemoSelect /></DepartmentsProvider></MemoryRouter>);
    await screen.findByRole('option', { name: /sales/i });
    // Expect only one GET within cache window
    const calls = (fetchSpy as any).mock.calls.filter(([u]: [RequestInfo]) => String(u).includes('/departments'));
    expect(calls.length).toBe(1);
  });
});
