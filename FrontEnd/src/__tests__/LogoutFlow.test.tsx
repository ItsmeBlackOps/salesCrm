import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Header } from '../components/layout/Header';
vi.mock('../hooks/useTheme', () => ({ useTheme: () => ({ theme: 'light', setTheme: vi.fn() }) }));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    Link: ({ to, children }: any) => <a href={to}>{children}</a>,
  } as any;
});

vi.mock('../hooks/useAuth');
import * as auth from '../hooks/useAuth';

// Render Dropdown content inline to expose 'Log out' without interactions
vi.mock('../components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
  DropdownMenuLabel: ({ children }: any) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}));

describe('Logout flow', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('shows logout for authenticated users and calls logout then navigates', async () => {
    const mockLogout = vi.fn();
    (auth.useAuth as any).mockReturnValue({ logout: mockLogout });
    const toggleSidebar = vi.fn();
    const openSettings = vi.fn();
    render(<Header toggleSidebar={toggleSidebar} openSettings={openSettings} />);
    const logoutBtn = screen.getByRole('button', { name: /log out/i });
    expect(logoutBtn).toBeInTheDocument();
    fireEvent.click(logoutBtn);
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});
