import { useMutation } from '@tanstack/react-query';
import type { FormEvent } from 'react';
import { adminRequest, json } from '../services/admin';
import { buttonClass, inputClass } from './adminFields';

export function PasswordPage() {
  const change = useMutation({
    gcTime: 0,
    mutationFn: async (form: HTMLFormElement) => {
      const data = new FormData(form);
      const novaSenha = String(data.get('novaSenha'));
      if (novaSenha !== data.get('confirmacao')) throw new Error('A confirmação não coincide com a nova senha.');
      await adminRequest('auth/change-password', json('POST', { senhaAtual: data.get('senhaAtual'), novaSenha }));
      form.reset();
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    change.mutate(event.currentTarget);
  }

  return <section className="p-4 sm:p-8">
    <h1 className="text-2xl font-bold">Alterar senha</h1>
    <p className="mt-2 text-sm">Use 12 caracteres ou mais, com letras e números ou símbolos.</p>
    <form className="mt-4 grid max-w-md gap-4" onSubmit={submit}>
      <label className="grid gap-1 text-sm">Senha atual<input className={inputClass} type="password" name="senhaAtual" autoComplete="current-password" required /></label>
      <label className="grid gap-1 text-sm">Nova senha<input className={inputClass} type="password" name="novaSenha" autoComplete="new-password" minLength={12} required /></label>
      <label className="grid gap-1 text-sm">Confirmar nova senha<input className={inputClass} type="password" name="confirmacao" autoComplete="new-password" minLength={12} required /></label>
      {change.isError && <p role="alert" className="text-red-300">{change.error.message}</p>}
      {change.isSuccess && <p role="status" className="text-emerald-400">Senha alterada.</p>}
      <button className={buttonClass} disabled={change.isPending}>{change.isPending ? 'Salvando…' : 'Alterar senha'}</button>
    </form>
  </section>;
}
