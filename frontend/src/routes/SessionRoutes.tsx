import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { PurchasesPage } from '../pages/PurchasesPage';
import { StockPage } from '../pages/StockPage';
import { CashSessionsPage } from '../pages/CashSessionsPage';
import { PdvPage } from '../pages/PdvPage';
import { AdminPage } from '../pages/AdminPage';
import { PasswordPage } from '../pages/PasswordPage';
import { modules, type Module } from '../pages/adminFields';
import { adminRequest } from '../services/admin';
import { LoginPage } from '../pages/LoginPage';
import { StatusPage } from '../pages/StatusPage';
import { logout, session, sessionKey, type Employee } from '../services/auth';

function Dashboard({ employee }: { employee: Employee }) {
  const official = import.meta.env.MODE === 'official';
  const stockLinks = [['estoque','Estoque'],['lotes','Lotes'],['movimentos','Movimentações']] as const;
  const client = useQueryClient();
  const access = useQuery({
    queryKey: ['admin-access', employee.id],
    queryFn: ({ signal }) => adminRequest<{ autorizado: boolean }>('admin/access', { signal }),
    retry: false,
  });
  const allowed = access.isSuccess && access.data.autorizado;
  const resources = Object.keys(modules) as Module[];
  const exit = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      await client.cancelQueries({ queryKey: sessionKey });
      client.removeQueries({ queryKey: ['admin'] });
      client.removeQueries({ queryKey: ['admin-access'] });
      client.setQueryData(sessionKey, null);
    },
  });

  return (
    <div>
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">{employee.nome}</p>
            <p className="text-sm text-slate-600">{employee.cargo.nome}</p>
          </div>
          <button className="rounded-lg border border-slate-400 px-4 py-2" disabled={exit.isPending}
            onClick={() => exit.mutate()}>{exit.isPending ? 'Saindo…' : 'Sair'}</button>
          {exit.isError && <p role="alert" className="w-full text-red-800">Não foi possível sair. Tente novamente.</p>}
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl md:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="border-b border-slate-200 bg-white p-4 md:min-h-screen md:border-b-0 md:border-r">
          <nav aria-label="Área administrativa" className="flex flex-wrap gap-3 text-sm md:grid">
            <Link to="/">Visão geral</Link>
            <Link to="/alterar-senha">Alterar senha</Link>
            {allowed && <Link to="/admin/pedidos-compra">Pedidos de Compra</Link>}
            {allowed && official && stockLinks.map(([path,label]) => <Link key={path} to={'/admin/' + path}>{label}</Link>)}
            {official && <Link to="/admin/sessoes-caixa">Sessões de Caixa</Link>}
            {official && <Link to="/pdv">Frente de Caixa (PDV)</Link>}
            {allowed && resources.map((module) => <Link key={module} to={'/admin/' + module}>{modules[module].title}</Link>)}
          </nav>
        </aside>
        <div className="min-w-0">
          <Routes>
            <Route path="alterar-senha" element={<PasswordPage />} />
            {official && <Route path="pdv" element={<PdvPage employee={employee} />} />}
            {official && <Route path="admin/sessoes-caixa" element={access.isPending
              ? <p className="p-8" role="status">Verificando acesso…</p> : <CashSessionsPage employee={employee} admin={allowed} />} />}
            <Route path="admin/pedidos-compra" element={access.isPending ? <p className="p-8" role="status">Verificando acesso…</p>
              : allowed ? <PurchasesPage employee={employee} />
              : <p className="p-8" role="alert">{access.isError ? 'Não foi possível verificar o acesso.' : 'Acesso administrativo não autorizado.'}</p>} />
            {official && stockLinks.map(([path]) => <Route key={path} path={'admin/' + path} element={access.isPending
              ? <p className="p-8" role="status">Verificando acesso…</p> : allowed ? <StockPage key={path} section={path} />
                : <p className="p-8" role="alert">Acesso administrativo não autorizado.</p>} />)}
            {resources.map((module) => <Route key={module} path={'admin/' + module} element={
              access.isPending ? <p className="p-8" role="status">Verificando acesso…</p>
                : allowed ? <AdminPage key={module} module={module} />
                : <p className="p-8" role="alert">{access.isError ? 'Não foi possível verificar o acesso.' : 'Acesso administrativo não autorizado.'}</p>
            } />)}
            <Route path="/" element={<>
      <StatusPage />
      <section className="mx-auto max-w-3xl px-6 pb-12">
        <h2 className="text-xl font-semibold">Módulos</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {(official ? ['Caixas e vendas', 'Relatórios'] : ['Estoque', 'Caixas e vendas', 'Relatórios']).map((name) => (
            <li className="rounded-xl border border-slate-200 bg-white p-4" key={name}>
              <p className="font-medium">{name}</p>
              <p className="text-sm text-slate-600">Em desenvolvimento</p>
            </li>
          ))}
        </ul>
      </section>
            </>} />
            <Route path="*" element={<p className="p-8">Página não encontrada.</p>} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

export function SessionRoute({ publicLogin = false }: { publicLogin?: boolean }) {
  const current = useQuery({ queryKey: sessionKey, queryFn: ({ signal }) => session(signal), retry: false });
  if (current.isPending) return <main className="p-8" role="status">Verificando sessão…</main>;
  if (current.isError) return (
    <main className="p-8">
      <p role="alert">{current.error.message}</p>
      <button className="mt-3 rounded border px-3 py-2" onClick={() => void current.refetch()}>Tentar novamente</button>
    </main>
  );
  if (publicLogin) return current.data ? <Navigate to="/" replace /> : <LoginPage />;
  return current.data ? <Dashboard employee={current.data} /> : <Navigate to="/login" replace />;
}
