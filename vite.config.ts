import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    // Same-origin /api in development too, exactly as in production where
    // one server serves both. Run the API alongside: npm run api:dev (8080).
    // With no API running, the app detects that and uses demo mode.
    proxy: {
      '/api': { target: process.env.API_PROXY_TARGET || 'http://localhost:8080' },
    },
  },
});
