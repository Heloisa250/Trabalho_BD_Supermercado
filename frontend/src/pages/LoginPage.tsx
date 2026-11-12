import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import logo from '../assets/logo.png';
import { login, sessionKey } from '../services/auth';
import { Velaris } from '../components/Velaris';
import { HandwrittenTitle } from '../components/HandwrittenTitle';

// Login em duas colunas: à esquerda o hero animado (Velaris) com a marca; à direita o formulário.
// Sem login social nem cadastro público: a conta é a matrícula criada pelo administrador.
export function LoginPage() {
  const client = useQueryClient();
  const [visible, setVisible] = useState(false);
  const attempt = useMutation({
    mutationFn: login,
    onSuccess: (employee) => client.setQueryData(sessionKey, employee),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (attempt.isPending) return;
    const form = new FormData(event.currentTarget);
    attempt.mutate({ matricula: String(form.get('matricula')), senha: String(form.get('senha')) });
  }

  const field = 'h-12 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-500';
  return (
    <main className="grid min-h-dvh bg-slate-950 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Esquerda: animação verde com a marca (oculta em telas pequenas). */}
      <div className="hidden lg:block">
        <Velaris height="100%" className="min-h-dvh" colors={['#86efac', '#4ade80', '#059669', '#022c22']} bg="#011a13" speed={1.5} grain={0.3}>
          <div className="relative flex h-full min-h-dvh items-center justify-center p-10">
            <div className="absolute left-10 top-10 flex items-center gap-3">
              <img src={logo} alt="" className="h-12 w-auto" />
              <span className="text-lg font-semibold text-white">Supermercado Qualidade Líder</span>
            </div>
            <div className="max-w-md text-center">
              <p className="text-4xl font-bold leading-tight tracking-tight text-white [text-shadow:0_2px_12px_rgb(0_0_0/0.5)]">Gestão do caixa ao estoque, em um só lugar.</p>
              <p className="mt-4 text-base text-slate-300 [text-shadow:0_1px_6px_rgb(0_0_0/0.5)]">PDV, compras, lotes e relatórios integrados ao banco de dados do supermercado.</p>
            </div>
          </div>
        </Velaris>
      </div>

      {/* Direita: conectar com a conta. */}
      <section className="flex items-center justify-center px-6 py-12 sm:px-12">
        <div className="w-full max-w-md">
          <img src={logo} alt="Supermercado Qualidade Líder" className="mb-8 h-16 w-auto" />
          <HandwrittenTitle text="Bem-vindo!" className="-ml-1" />
          <p className="mt-1 text-sm text-slate-400">Sem acesso? <span className="font-medium text-emerald-400">Peça ao administrador</span> o cadastro da sua matrícula.</p>

          <form className="mt-10 flex flex-col gap-5" onSubmit={submit}>
            <div className="flex flex-col gap-2">
              <label htmlFor="matricula" className="text-sm font-medium text-slate-200">Matrícula</label>
              <input id="matricula" name="matricula" required maxLength={20} autoComplete="username" placeholder="F0001" className={field} />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="senha" className="text-sm font-medium text-slate-200">Senha</label>
              <div className="relative">
                <input id="senha" name="senha" type={visible ? 'text' : 'password'} required autoComplete="current-password" placeholder="••••••••" className={field + ' pr-12'} />
                <button type="button" onClick={() => setVisible(!visible)} aria-controls="senha" aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
                  className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-slate-400 hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-emerald-500">
                  {visible ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
                </button>
              </div>
            </div>
            {attempt.isError && <p role="alert" className="text-sm text-red-300">{attempt.error.message}</p>}
            {/* Botão com o mesmo gradiente animado (Velaris) do painel esquerdo. */}
            <button type="submit" disabled={attempt.isPending}
              className="group relative mt-2 block h-12 w-full overflow-hidden rounded-xl border border-emerald-300/50 bg-emerald-400/10 p-0 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:opacity-60">
              {/* Animação em verde claro e translúcida ao fundo; a palavra "Entrar" fica em destaque por cima. */}
              <span aria-hidden="true" className="absolute inset-0 opacity-45 transition-opacity group-hover:opacity-65">
                <Velaris height="100%" vignette={false} colors={['#bbf7d0', '#86efac', '#4ade80', '#34d399']} bg="#10b981" speed={3} grain={0.15} />
              </span>
              <span className="relative z-10 flex h-full w-full items-center justify-center text-base font-bold tracking-wide [text-shadow:0_1px_3px_rgb(0_0_0/0.45)]">
                {attempt.isPending ? 'Entrando…' : 'Entrar'}
              </span>
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
