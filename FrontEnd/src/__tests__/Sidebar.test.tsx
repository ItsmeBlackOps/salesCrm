import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, cleanup } from '@testing-library/react';
import { Sidebar } from '../components/layout/Sidebar';
import * as authModule from '../hooks/useAuth';
import * as accessModule from '../hooks/useRoleAccess';

vi.mock('../hooks/useAuth');
vi.mock('../hooks/useRoleAccess');
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
});

beforeEach(() => {
  cleanup();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

function setup(roleAccess: Record<string, boolean>) {
  (authModule.useAuth as any).mockReturnValue({ user: { userid: 1, roleid: 2 } });
  (accessModule.useRoleAccess as any).mockReturnValue({ roleAccess });
  return render(
    <MemoryRouter>
      <Sidebar isOpen={true} toggleSidebar={() => {}} />
    </MemoryRouter>
  );
}

describe('Sidebar', () => {
  it('hides NavItem when role access false', () => {
    setup({ leads: false, dashboard: true });
    expect(screen.queryByText('Leads')).toBeNull();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('shows NavItem when role access true', () => {
    setup({ leads: true, dashboard: true });
    expect(screen.getByText('Leads')).toBeInTheDocument();
  });
});
