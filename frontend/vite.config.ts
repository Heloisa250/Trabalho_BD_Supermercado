import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'FRONTEND_');
  const official = mode === 'official';
  // Em modo oficial, FRONTEND_PORT/FRONTEND_API_TARGET só são usados para validação isolada (ex.: 5177 → API 3012 em cópia do banco).
  const port = Number(env.FRONTEND_PORT ?? (official ? 5176 : 5173));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('FRONTEND_PORT inválida.');
  }
  return { plugins: [react(), tailwindcss()], server: { port, strictPort: true, proxy: { '/api/v1': env.FRONTEND_API_TARGET ?? (official ? 'http://127.0.0.1:3002' : 'http://127.0.0.1:3001') } } };
});
