const apiUrl = (import.meta.env.MODE === 'official' ? '/api/v1' : import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? '/api/v1' : 'http://localhost:3001/api/v1')).replace(/\/+$/, '');

export function request(path: string, options: RequestInit = {}) {
  const timeout = AbortSignal.timeout(8000);
  return fetch(apiUrl + '/' + path, {
    ...options,
    signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
    credentials: 'include',
    cache: 'no-store',
  });
}
