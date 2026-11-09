import { request } from './http';

export interface Employee {
  id: number;
  nome: string;
  matricula: string;
  cargo: { id: number; nome: string };
  permissoes: { pode_cancelar_item: boolean };
}

export const sessionKey = ['employee-session'] as const;

export async function session(signal: AbortSignal): Promise<Employee | null> {
  const response = await request('auth/me', { signal });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error('Não foi possível verificar a sessão.');
  return response.json();
}

export async function login(input: { matricula: string; senha: string }): Promise<Employee> {
  const response = await request('auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message ?? 'Não foi possível entrar. Tente novamente.');
  }
  return response.json();
}

export async function logout() {
  const response = await request('auth/logout', { method: 'POST' });
  if (!response.ok) throw new Error('Não foi possível sair. Tente novamente.');
}
