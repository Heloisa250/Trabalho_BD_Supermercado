import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { login, sessionKey } from '../services/auth';

export function LoginPage() {
  const client = useQueryClient();
  const [visible, setVisible] = useState(false);
  const attempt = useMutation({
    mutationFn: login,
    onSuccess: (employee) => client.setQueryData(sessionKey, employee),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    attempt.mutate({ matricula: String(form.get('matricula')), senha: String(form.get('senha')) });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-emerald-950 p-5 sm:p-10">
      <section className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl sm:p-10">
        <p className="text-sm font-semibold text-emerald-800">Portal do funcionário</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Supermercado Qualidade Líder</h1>
        <p className="mt-3 text-sm text-slate-600">Use sua matrícula e senha para acessar o sistema.</p>
        <form className="mt-7 grid gap-4" onSubmit={submit}>
          <label className="grid gap-1 text-sm font-medium" htmlFor="matricula">Matrícula
            <input id="matricula" name="matricula" required maxLength={20} autoComplete="username"
              className="rounded-lg border border-slate-400 px-3 py-2.5" />
          </label>
          <div className="grid gap-1">
            <label htmlFor="senha" className="text-sm font-medium">Senha</label>
            <div className="flex gap-2">
              <input id="senha" name="senha" type={visible ? 'text' : 'password'} required autoComplete="current-password"
                className="min-w-0 flex-1 rounded-lg border border-slate-400 px-3 py-2.5" />
              <button type="button" className="rounded-lg px-2 text-sm font-semibold text-emerald-800"
                onClick={() => setVisible(!visible)}>{visible ? 'Ocultar' : 'Mostrar'}</button>
            </div>
          </div>
          {attempt.isError && <p role="alert" className="text-sm text-red-800">{attempt.error.message}</p>}
          <button type="submit" disabled={attempt.isPending}
            className="rounded-lg bg-emerald-800 px-4 py-3 font-semibold text-white hover:bg-emerald-900 disabled:opacity-60">
            {attempt.isPending ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </section>
    </main>
  );
}
