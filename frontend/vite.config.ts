import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'FRONTEND_');
  const official = mode === 'official';
  const port = official ? 5176 : Number(env.FRONTEND_PORT ?? 5173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('FRONTEND_PORT inválida.');
  }
  return { plugins: [react(), tailwindcss()], server: { port, strictPort: true, proxy: { '/api/v1': official ? 'http://127.0.0.1:3002' : env.FRONTEND_API_TARGET ?? 'http://127.0.0.1:3001' } } };
});
