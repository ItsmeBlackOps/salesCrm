import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, cleanup } from '@testing-library/react';
import ProtectedRoute from '../components/ProtectedRoute';
import * as authModule from '../hooks/useAuth';
import * as accessModule from '../hooks/useRoleAccess';

vi.mock('../hooks/useAuth');
vi.mock('../hooks/useRoleAccess');

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

function setup(roleAccess: Record<string, boolean>, user: unknown = { userid: 1 }) {
  (authModule.useAuth as any).mockReturnValue({ user });
  (accessModule.useRoleAccess as any).mockReturnValue({ roleAccess });
  return render(
    <MemoryRouter initialEntries={['/test']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/test" element={<ProtectedRoute componentId="leads"><div>Allowed</div></ProtectedRoute>} />
        <Route path="/" element={<div>Home</div>} />
        <Route path="/auth/signin" element={<div>SignIn</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  it('renders children when access allowed', () => {
    setup({ leads: true });
    expect(screen.getByText('Allowed')).toBeInTheDocument();
  });

  it('redirects when access denied', () => {
    setup({ leads: false });
    expect(screen.getByText('Home')).toBeInTheDocument();
  });
});
