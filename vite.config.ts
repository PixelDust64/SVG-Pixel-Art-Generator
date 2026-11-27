import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createEnvApiPlugin } from './server/envApiPlugin';

export default defineConfig(() => {
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    preview: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react(), createEnvApiPlugin(__dirname)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
