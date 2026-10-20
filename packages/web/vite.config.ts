import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiPort = process.env.WEB_SERVER_PORT || 3005;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: false,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
});

