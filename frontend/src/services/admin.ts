import { request } from './http';

export type Row = { id: number } & Record<string, string | number | boolean | null>;
export type Page = { items: Row[]; pagina: number; mais: boolean };

export async function adminRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await request(path, options);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message ?? 'Não foi possível concluir a operação.');
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}

export async function optionsFor(path: string, signal: AbortSignal) {
  const items: Row[] = [];
  for (let pagina = 1; ; pagina++) {
    const result = await adminRequest<Page>(path + '?limite=100&pagina=' + pagina, { signal });
    items.push(...result.items);
    if (!result.mais) return items;
  }
}

// Mantido por compatibilidade; a regra única está em services/format.
export { reais } from './format';

export function json(method: 'POST' | 'PATCH', body: object): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
