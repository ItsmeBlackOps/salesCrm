import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import { fileURLToPath, URL } from 'node:url';


// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    // Bind to all IPv4 interfaces for cross-platform compatibility
    host: '0.0.0.0',
    port: 9911,
    open: true,
    // Allow any Host header (useful behind proxies/tunnels)
    allowedHosts: ['sales.silverspace.tech'],
    hmr: false,
  },
  plugins: [react()].filter(Boolean),
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 9911,
  },
  test: {
    environment: 'jsdom',
  },
}));
