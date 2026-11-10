import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useMatch } from 'react-router-dom';
import { buttonClass } from '../components/ui';
import logo from '../assets/logo.png';
import {
  ArrowLeftRight, ArrowUpRight, Boxes, BriefcaseBusiness, ClipboardList, CreditCard, House, KeyRound, LayoutDashboard, LogOut,
  Menu, Monitor, Package, PanelLeftClose, PanelLeftOpen, ScanBarcode, Tag, Tags, Truck, Users, Wallet, Warehouse, X, type LucideIcon,
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

const navbarItem = 'group flex h-10 min-w-10 shrink-0 items-center justify-center rounded-full px-2.5 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-400 aria-[current=page]:bg-slate-700 aria-[current=page]:text-white';
const navbarLabel = 'hidden grid-cols-[0fr] text-xs font-medium whitespace-nowrap motion-safe:transition-[grid-template-columns] motion-safe:duration-200 sm:grid sm:group-aria-[current=page]:grid-cols-[1fr]';

function Dashboard({ employee }: { employee: Employee }) {
  const isHome = useMatch('/') !== null;
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarToggleLabel = sidebarCollapsed ? 'Expandir barra lateral' : 'Recolher barra lateral';
  const SidebarToggleIcon = sidebarCollapsed ? PanelLeftOpen : PanelLeftClose;
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
    <div className={'dashboard-background min-h-screen md:grid md:grid-rows-[61px_1fr] ' +
      (sidebarCollapsed ? 'md:grid-cols-[5.5rem_minmax(0,1fr)]' : 'md:grid-cols-[14rem_minmax(0,1fr)]')}>
      <header className="sticky top-0 z-20 bg-transparent px-3 sm:px-6 md:col-start-2 md:row-start-1">
        <div className="grid h-[60px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <button type="button" className={navbarItem + ' justify-self-start md:hidden'} aria-expanded={menuOpen} aria-controls="menu-principal"
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'} onClick={() => setMenuOpen(open => !open)}>
            {menuOpen ? <X aria-hidden="true" className="size-5" /> : <Menu aria-hidden="true" className="size-5" />}
          </button>
          <nav aria-label="Atalhos da sessão" className="col-start-2 flex min-w-0 max-w-full items-center gap-0.5 justify-self-center rounded-full bg-transparent p-1">
            <NavLink to="/" end aria-label="Qualidade Líder — Início" title="Início"
              className={navbarItem + ' max-sm:shrink' + (isHome ? ' gap-1 sm:gap-2 sm:pr-3' : '')} onClick={() => setMenuOpen(false)}>
              <img src={logo} alt="" className="size-6 shrink-0 object-contain sm:size-8" />
              {isHome && <span className="truncate text-xs font-semibold sm:text-sm">Qualidade Líder</span>}
            </NavLink>
            <NavLink to="/alterar-senha" aria-label="Alterar senha" title="Alterar senha" className={navbarItem} onClick={() => setMenuOpen(false)}>
              <KeyRound aria-hidden="true" className="size-4 shrink-0" />
              <span aria-hidden="true" className={navbarLabel}><span className="overflow-hidden"><span className="pl-2 pr-1">Alterar senha</span></span></span>
            </NavLink>
            <button type="button" aria-label={exit.isPending ? 'Saindo…' : 'Sair'} title="Sair"
              className={navbarItem + ' disabled:opacity-50'} disabled={exit.isPending} onClick={() => exit.mutate()}>
              <LogOut aria-hidden="true" className="size-4" />
            </button>
          </nav>
          <div className="col-start-3 min-w-0 max-w-[24vw] justify-self-end text-right leading-tight md:max-w-full">
            <p className="truncate text-xs font-semibold text-slate-100 sm:text-sm" title={employee.nome}>{employee.nome}</p>
            <p className="sr-only truncate text-xs text-slate-400 sm:not-sr-only">{employee.matricula} · {employee.cargo.nome}</p>
          </div>
        </div>
        {exit.isError && <p role="alert" className="absolute right-3 top-full mt-2 rounded-lg border bg-slate-900 px-3 py-2 text-sm text-red-300">Não foi possível sair. Tente novamente.</p>}
      </header>
      <div className="grid md:contents">
        <aside id="menu-principal" className={(menuOpen ? 'block' : 'hidden') + ' bg-slate-900/15 px-2 py-4 backdrop-blur-2xl md:col-start-1 md:row-span-2 md:row-start-1 md:block'}>
          <div className="mb-4 flex items-center justify-between gap-1">
            <Link to="/" aria-label="Supermercado Qualidade Líder — Início"
              className="flex min-w-0 items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-emerald-400" onClick={() => setMenuOpen(false)}>
              <img src={logo} alt="" className={(sidebarCollapsed ? 'size-8' : 'size-14') + ' shrink-0 object-contain'} />
              {!sidebarCollapsed && <span className="text-sm font-semibold leading-tight text-slate-100">Supermercado<br />Qualidade Líder</span>}
            </Link>
            <button type="button" aria-label={sidebarToggleLabel} title={sidebarToggleLabel} aria-expanded={!sidebarCollapsed} aria-controls="links-menu-principal"
              className="grid size-8 shrink-0 place-items-center rounded-md text-slate-300 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-400"
              onClick={() => setSidebarCollapsed(collapsed => !collapsed)}>
              <SidebarToggleIcon aria-hidden="true" className="size-4" />
            </button>
          </div>
          <nav id="links-menu-principal" aria-label="Menu principal"
            className={sidebarCollapsed ? 'flex flex-wrap gap-2 md:grid' : 'grid gap-4 text-sm'}>
            {groups.map(group => <div key={group.title}>
              <p className={sidebarCollapsed ? 'sr-only' : 'mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-slate-400'}>{group.title}</p>
              <ul className={sidebarCollapsed ? 'flex gap-0.5 md:grid' : 'grid gap-0.5'}>{group.links.map(item => <li key={item.to}>
                <NavLink to={item.to} end={item.to === '/'} title={sidebarCollapsed ? item.label : undefined} onClick={() => setMenuOpen(false)}
                  className={({ isActive }) => 'flex items-center rounded-md px-2 py-1.5 ' +
                  (sidebarCollapsed ? 'min-h-8 min-w-8 justify-center ' : 'gap-2.5 ') +
                  (isActive ? 'bg-emerald-950/50 font-semibold text-emerald-300' : 'text-slate-300 hover:bg-slate-800')}>
                  <item.Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
                  <span className={sidebarCollapsed ? 'sr-only' : undefined}>{item.label}</span>
                </NavLink>
              </li>)}</ul>
            </div>)}
          </nav>
        </aside>
        <div className="min-w-0 md:col-start-2 md:row-start-2">
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
