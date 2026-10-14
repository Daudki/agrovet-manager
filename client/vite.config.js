import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development the Vite dev server proxies /api to the Node server, so the
// session cookie is same-origin and no CORS configuration is needed.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: false } },
  },
  build: { sourcemap: false, chunkSizeWarningLimit: 700 },
});
