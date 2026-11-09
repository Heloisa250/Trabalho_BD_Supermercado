import { request } from './http';

export async function checkStatus(signal: AbortSignal) {
  const health = await request('health', { signal });
  if (!health.ok || (await health.json())?.status !== 'ok') {
    throw new Error('API indisponível.');
  }

  try {
    const ready = await request('ready', { signal });
    const data = await ready.json();
    if (ready.ok && data?.status === 'ready') return 'Conectado';
    if (ready.status === 503 && data?.error?.code === 'DATABASE_UNAVAILABLE') return 'Indisponível';
  } catch (error) {
    if (signal.aborted) throw error;
  }
  return 'Estado desconhecido. O diagnóstico do banco falhou.';
}
