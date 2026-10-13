import http from 'node:http';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The dev server proxies /api and /auth to the Express service, so the
 * browser treats both as one origin. That keeps the session cookie
 * first-party in development and matches how the app is served in
 * production (static assets behind the same host as the API).
 *
 * The proxy reuses a few kept-alive connections to 127.0.0.1 rather than
 * opening a new one per request (and trying ::1 first): on a machine short of
 * free ports, per-request connections fail with EADDRINUSE / ETIMEDOUT.
 */
const agent = new http.Agent({ keepAlive: true, maxSockets: 16 });
const api = { target: 'http://127.0.0.1:4000', changeOrigin: true, agent };

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': api,
      '/auth': api,
    },
  },
});
