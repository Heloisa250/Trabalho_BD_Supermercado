import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { buttonClass } from '../components/ui';
import logo from '../assets/logo.png';
import {
  ArrowLeftRight, ArrowUpRight, Boxes, BriefcaseBusiness, ClipboardList, CreditCard, House, KeyRound, LayoutDashboard, LogOut,
  Monitor, Package, ScanBarcode, Tag, Tags, Truck, Users, Wallet, Warehouse, type LucideIcon,
} from 'lucide-react';
import { PurchasesPage } from '../pages/PurchasesPage';
import { StockPage } from '../pages/StockPage';
import { CashSessionsPage } from '../pages/CashSessionsPage';
import { PdvPage } from '../pages/PdvPage';
import { DashboardPage } from '../pages/DashboardPage';
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
  const [menuOpen, setMenuOpen] = useState(false);
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

  // Menus agrupados. A visibilidade só esconde o que não se aplica; a proteção real continua no back-end.
  // Ícone de cada item conforme a função no sistema.
  const icons: Record<string, LucideIcon> = {
    '/': House, '/pdv': ScanBarcode, '/admin/sessoes-caixa': Wallet, '/admin/dashboard': LayoutDashboard,
    '/admin/pedidos-compra': ClipboardList, '/admin/fornecedores': Truck, '/admin/estoque': Warehouse, '/admin/lotes': Boxes,
    '/admin/movimentos': ArrowLeftRight, '/admin/produtos': Package, '/admin/categorias': Tags, '/admin/marcas': Tag,
    '/admin/funcionarios': Users, '/admin/cargos': BriefcaseBusiness, '/admin/caixas': Monitor, '/admin/formas-pagamento': CreditCard,
  };
  const link = (to: string, label: string) => ({ to, label, Icon: icons[to] ?? House });
  const groups = [
    { title: 'Visão geral', links: [link('/', 'Início')] },
    { title: 'Frente de caixa', links: official ? [link('/pdv', 'PDV'), link('/admin/sessoes-caixa', 'Sessões de caixa')] : [] },
    { title: 'Relatórios', links: allowed && official ? [link('/admin/dashboard', 'Dashboard gerencial')] : [] },
    { title: 'Compras', links: allowed ? [link('/admin/pedidos-compra', 'Pedidos de compra'), link('/admin/fornecedores', modules.fornecedores.title)] : [] },
    { title: 'Estoque', links: allowed && official ? stockLinks.map(([path, label]) => link('/admin/' + path, label)) : [] },
    { title: 'Catálogo', links: allowed ? (['produtos', 'categorias', 'marcas'] as Module[]).map(key => link('/admin/' + key, modules[key].title)) : [] },
    { title: 'Administração', links: allowed ? (['funcionarios', 'cargos', 'caixas', 'formas-pagamento'] as Module[]).map(key => link('/admin/' + key, modules[key].title)) : [] },
  ].filter(group => group.links.length);
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button type="button" className={buttonClass + ' md:hidden'} aria-expanded={menuOpen} aria-controls="menu-principal"
              onClick={() => setMenuOpen(open => !open)}>{menuOpen ? 'Fechar menu' : 'Menu'}</button>
            <Link to="/" className="font-bold text-emerald-400">Qualidade Líder</Link>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <p className="text-sm font-semibold">{employee.nome}</p>
              <p className="text-xs text-slate-400">{employee.matricula} · {employee.cargo.nome}</p>
            </div>
            <span className="hidden sm:block"><Link to="/alterar-senha" className={buttonClass}><KeyRound aria-hidden="true" className="size-4" />Alterar senha</Link></span>
            <button className={buttonClass} disabled={exit.isPending} onClick={() => exit.mutate()}><LogOut aria-hidden="true" className="size-4" />{exit.isPending ? 'Saindo…' : 'Sair'}</button>
          </div>
          {exit.isError && <p role="alert" className="w-full text-sm text-red-300">Não foi possível sair. Tente novamente.</p>}
        </div>
      </header>
      <div className="grid md:grid-cols-[14rem_minmax(0,1fr)]">
        <aside id="menu-principal" className={(menuOpen ? 'block' : 'hidden') + ' border-b border-slate-800 bg-slate-900 p-4 md:sticky md:top-[61px] md:block md:h-[calc(100vh-61px)] md:overflow-y-auto md:border-b-0 md:border-r'}>
          <Link to="/" className="mb-4 flex items-center gap-3 rounded-lg px-2 py-1" onClick={() => setMenuOpen(false)}>
            <img src={logo} alt="" className="h-12 w-auto" />
            <span className="text-sm font-semibold leading-tight text-slate-100">Supermercado<br />Qualidade Líder</span>
          </Link>
          <nav aria-label="Menu principal" className="grid gap-4 text-sm" onClick={event => { if ((event.target as HTMLElement).closest('a')) setMenuOpen(false); }}>
            {groups.map(group => <div key={group.title}>
              <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{group.title}</p>
              <ul className="grid gap-0.5">{group.links.map(item => <li key={item.to}>
                <NavLink to={item.to} end={item.to === '/'} className={({ isActive }) => 'flex items-center gap-2.5 rounded-md px-2 py-1.5 ' +
                  (isActive ? 'bg-emerald-950/50 font-semibold text-emerald-300' : 'text-slate-300 hover:bg-slate-800')}>
                  <item.Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />{item.label}</NavLink>
              </li>)}</ul>
            </div>)}
            <Link to="/alterar-senha" className="flex items-center gap-2.5 px-2 text-slate-300 sm:hidden"><KeyRound aria-hidden="true" className="size-4" />Alterar senha</Link>
          </nav>
        </aside>
        <div className="min-w-0">
          <Routes>
            <Route path="alterar-senha" element={<PasswordPage />} />
            {official && <Route path="pdv" element={<PdvPage employee={employee} />} />}
            {official && <Route path="admin/dashboard" element={access.isPending ? <p className="p-8" role="status">Verificando acesso…</p>
              : allowed ? <DashboardPage /> : <p className="p-8" role="alert">Acesso administrativo não autorizado.</p>} />}
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
        <h2 className="text-xl font-semibold">Acesso rápido</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {groups.filter(group => group.title !== 'Visão geral').map(group => (
            <li className="rounded-xl border border-slate-800 bg-slate-900 p-4" key={group.title}>
              <p className="font-medium">{group.title}</p>
              <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">{group.links.map(item =>
                <Link key={item.to} className="inline-flex items-center gap-0.5 text-emerald-400 underline-offset-2 hover:underline" to={item.to}>{item.label}<ArrowUpRight aria-hidden="true" className="size-3.5" strokeWidth={2} /></Link>)}</p>
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
      <button className={buttonClass + ' mt-3'} onClick={() => void current.refetch()}>Tentar novamente</button>
    </main>
  );
  if (publicLogin) return current.data ? <Navigate to="/" replace /> : <LoginPage />;
  return current.data ? <Dashboard employee={current.data} /> : <Navigate to="/login" replace />;
}
