import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The dev server proxies /api and /auth to the Express service, so the
 * browser treats both as one origin. That keeps the session cookie
 * first-party in development and matches how the app is served in
 * production (static assets behind the same host as the API).
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/auth': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
});
