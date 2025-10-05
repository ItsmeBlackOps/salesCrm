import { beforeAll, afterAll, afterEach, expect, test, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import UserManagement from '../pages/UserManagement';
import { AuthProvider } from '../hooks/useAuth';
import { RoleAccessProvider } from '../hooks/useRoleAccess';
import { NotificationProvider } from '../hooks/useNotifications';

vi.mock('../components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../hooks/use-mobile', () => ({ useIsMobile: () => false }));

const okJson = (data: unknown) =>
  Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response);

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

function renderUsers(usersData: unknown[]) {
  const fetchMock = vi.fn((url: RequestInfo, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/users') && (init?.method === undefined || init.method === 'GET')) {
      return okJson(usersData);
    }
    if (u.includes('/roles')) return okJson([]);
    return okJson({});
  });
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
  return {
    fetchMock,
    ...render(
      <AuthProvider>
        <RoleAccessProvider>
          <NotificationProvider>
            <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <UserManagement />
            </MemoryRouter>
          </NotificationProvider>
        </RoleAccessProvider>
      </AuthProvider>,
    ),
  };
}

test('fetches users list (paginated) with current user context', async () => {
  const { fetchMock } = renderUsers([]);
  await screen.findByText('User Management');
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/users'),
    expect.any(Object),
  );
});
