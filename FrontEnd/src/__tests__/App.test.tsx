import { beforeAll, afterAll, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

// Mock fetch to avoid network requests during test
beforeAll(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })) as unknown as typeof fetch);
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation(() => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

test('renders sign in page by default', () => {
  render(<App />);
  expect(screen.getByText(/Welcome back/i)).toBeDefined();
});
