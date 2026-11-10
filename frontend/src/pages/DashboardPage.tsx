import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { adminRequest, reais } from '../services/admin';
import { buttonClass, inputClass } from './adminFields';
import { localTime } from './PdvPayment';
import { Badge, Empty } from '../components/ui';

// Uma única cor de dado (identidade da marca); cada gráfico mostra uma só medida, então não há paleta categórica.
const BAR = '#10b981';
const EMPTY = '#334155';

type Status<T extends string> = Record<T, { vendas: number; valor: string }>;
type Resumo = { periodo: { inicio: string; fim: string }; faturamento: string; vendas_finalizadas: number; ticket_medio: string | null;
  vendas_por_status: Status<'ABERTA' | 'FINALIZADA' | 'CANCELADA'>; vendas_abertas_agora: number; pedidos_por_status: Record<string, number>;
  produtos_estoque_baixo: number; lotes_proximos_vencimento: number; horizonte_dias: number; caixas_abertos: number };
type Serie = { pontos: { periodo: string; vendas: number; faturamento: string; sem_registro: boolean }[] };
type Produtos = { ranking: { posicao: number; id_produto: number; nome: string; codigo_barras: string; unidade_medida: string; categoria: string; quantidade: string; receita: string; vendas: number }[];
  por_unidade: { unidade_medida: string; quantidade: string; receita: string; produtos: number }[] };
type Pagamentos = { formas: { id_forma_pagamento: number; descricao: string; dinheiro: boolean; pagamentos: number; vendas: number; aplicado: string; recebido: string; troco: string }[];
  dinheiro_fisico: { recebido: string; troco: string; aplicado: string }; vendas_com_pagamento_multiplo: number;
  conciliacao: { faturamento_vendas: string; total_aplicado: string; diferenca: string } };
type Estoque = { hoje: string; totais: Record<string, number>;
  produtos: { id_produto: number; nome: string; codigo_barras: string; categoria: string; unidade_medida: string; ativo: boolean; estoque_minimo: string; estoque_maximo: string; fisico: string; disponivel: string; vencido: string; situacao: string }[];
  lotes: { id_lote: number; codigo_lote: string; produto: string; unidade_medida: string; data_validade: string | null; quantidade_atual: string; situacao: string }[] };
type Compras = { por_status: Record<string, { pedidos: number; valor: string }>; total_pedidos: number; valor_estimado: string;
  aguardando_recebimento: { id_pedido: number; fornecedor: string; data_pedido: string; data_prevista: string | null; status: string; valor: string; itens: number; atrasado: boolean }[] };
type Fornecedores = { items: { id_fornecedor: number; fornecedor: string; pedidos: number; recebidos: number; cancelados: number; valor_total: string; valor_recebido: string; produtos_fornecidos: number; recebidos_com_prazo: number; recebidos_com_atraso: number }[] };
type Caixas = { abertas: number; fechadas: number;
  sessoes: { id_sessao: number; numero: number; matricula: string; operador: string; data_abertura: string; data_fechamento: string | null; situacao: string; fundo_troco: string; recebido_dinheiro: string; valor_esperado: string; valor_contado: string | null; diferenca: string | null; resultado: string | null; vendas_abertas: number }[];
  operadores: { id_funcionario: number; operador: string; matricula: string; sessoes: number; vendas_finalizadas: number; faturamento: string }[] };
type Movimentos = { pagina: number; mais: boolean; items: { id_movimentacao: number; data_hora: string; tipo: string; quantidade: string; codigo_lote: string; produto: string; unidade_medida: string; observacao: string | null }[];
  totais: { tipo: string; unidade_medida: string; movimentacoes: number; quantidade: string; positivo: string; negativo: string }[] };

const br = (day: string) => day.slice(0, 10).split('-').reverse().join('/');
const num = (value: string) => Number(value); // apenas para escala do gráfico; os rótulos usam o texto decimal exato
const qty = (value: string, unit: string) => (unit === 'UN' ? value.replace(/\.0+$/, '') : value.replace('.', ',')) + ' ' + unit;

function useReport<T>(path: string, query: string) {
  return useQuery({ queryKey: ['admin', 'dashboard', path, query], queryFn: ({ signal }) => adminRequest<T>('dashboard/' + path + (query ? '?' + query : ''), { signal }) });
}

function Panel({ title, note, state, children }: { title: string; note?: string; state: { isPending: boolean; isError: boolean; error: Error | null }; children: ReactNode }) {
  return <section className="min-w-0 rounded-xl border border-slate-800 bg-slate-900 p-4">
    <h2 className="font-semibold">{title}</h2>
    {note && <p className="text-xs text-slate-400">{note}</p>}
    <div className="mt-3">{state.isPending ? <p role="status" className="text-sm text-slate-400">Carregando…</p>
      : state.isError ? <p role="alert" className="text-sm text-red-300">{state.error?.message}</p> : children}</div>
  </section>;
}

function Card({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-900 p-4">
    <p className="text-sm text-slate-400">{label}</p>
    <p className="mt-1 truncate text-2xl font-bold tabular-nums">{value}</p>
    {hint && <p className="text-xs text-slate-400">{hint}</p>}
  </div>;
}

function Table({ head, rows, empty }: { head: string[]; rows: ReactNode[][]; empty: string }) {
  if (!rows.length) return empty ? <Empty>{empty}</Empty> : null;
  return <div className="overflow-x-auto"><table className="w-full text-left text-sm">
    <thead><tr className="text-slate-400">{head.map(label => <th key={label} className="whitespace-nowrap p-2 font-medium">{label}</th>)}</tr></thead>
    <tbody>{rows.map((row, index) => <tr key={index} className="border-t border-slate-800">{row.map((cell, column) => <td key={column} className={'p-2 tabular-nums ' + (typeof cell === 'string' && /^(R\$|−?-?\d)/.test(cell) ? 'whitespace-nowrap' : '')}>{cell}</td>)}</tr>)}</tbody>
  </table></div>;
}

const tooltipStyle = { borderRadius: 8, border: '1px solid #334155', fontSize: 12, background: '#0f172a', color: '#e2e8f0' };

export function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const inicio = params.get('inicio') ?? '';
  const fim = params.get('fim') ?? '';
  const agrupamento = params.get('agrupamento') ?? 'dia';
  const range = new URLSearchParams(Object.entries({ inicio, fim }).filter(([, value]) => value)).toString();
  const join = (...parts: string[]) => parts.filter(Boolean).join('&');
  const resumo = useReport<Resumo>('resumo', range);
  const serie = useReport<Serie>('vendas/serie', join(range, 'agrupamento=' + agrupamento));
  const produtos = useReport<Produtos>('vendas/produtos', range);
  const pagamentos = useReport<Pagamentos>('vendas/pagamentos', range);
  const estoque = useReport<Estoque>('estoque/alertas', '');
  const compras = useReport<Compras>('compras/resumo', range);
  const fornecedores = useReport<Fornecedores>('fornecedores', range);
  const caixas = useReport<Caixas>('caixas/resumo', range);
  const movimentos = useReport<Movimentos>('estoque/movimentacoes', join(range, params.get('tipo') ? 'tipo=' + params.get('tipo') : ''));
  const r = resumo.data;
  const period = r ? br(r.periodo.inicio) + ' a ' + br(r.periodo.fim) : '';

  return <section className="min-w-0 space-y-4 p-4 sm:p-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-bold">Dashboard gerencial</h1>
        <p className="text-sm text-slate-400">Ambiente de demonstração acadêmica — dados do banco oficial do projeto, não de uma empresa em operação.</p></div>
      <form key={params.toString()} className="flex flex-wrap items-end gap-2 text-sm" onSubmit={event => {
        event.preventDefault();
        const next = new URLSearchParams();
        for (const [key, value] of new FormData(event.currentTarget)) if (value) next.set(key, String(value));
        setParams(next);
      }}>
        <label className="grid gap-1">De <input type="date" name="inicio" defaultValue={inicio} className={inputClass} /></label>
        <label className="grid gap-1">Até <input type="date" name="fim" defaultValue={fim} className={inputClass} /></label>
        <label className="grid gap-1">Agrupar <select name="agrupamento" defaultValue={agrupamento} className={inputClass}>
          <option value="dia">Diário</option><option value="semana">Semanal</option><option value="mes">Mensal</option></select></label>
        <button className={buttonClass}>Aplicar</button>
      </form>
    </div>
    {period && <p className="text-sm text-slate-400">Período: <strong>{period}</strong> (datas inclusivas, horário de Brasília). Sem filtro, mostra os últimos 30 dias.</p>}
    {resumo.isError && <p role="alert" className="text-red-300">{resumo.error.message}</p>}

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      <Card label="Faturamento" value={r ? reais(r.faturamento) : '…'} hint="Vendas finalizadas no período" />
      <Card label="Vendas finalizadas" value={r?.vendas_finalizadas ?? '…'} />
      <Card label="Ticket médio" value={r ? (r.ticket_medio ? reais(r.ticket_medio) : 'Sem vendas') : '…'} />
      <Card label="Pedidos a receber" value={r ? r.pedidos_por_status.PENDENTE + r.pedidos_por_status.ENVIADO : '…'} hint={r ? r.pedidos_por_status.PENDENTE + ' pendente(s) · ' + r.pedidos_por_status.ENVIADO + ' enviado(s)' : undefined} />
      <Card label="Estoque baixo" value={r?.produtos_estoque_baixo ?? '…'} hint="Produtos ativos abaixo do mínimo" />
      <Card label="Caixas abertos" value={r?.caixas_abertos ?? '…'} hint="Sessões sem fechamento" />
    </div>
    {r && <div className="grid grid-cols-3 gap-3 text-sm">
      {(['FINALIZADA', 'ABERTA', 'CANCELADA'] as const).map(name => <div key={name} className="rounded-lg border border-slate-800 bg-slate-900 p-3">
        <p className="text-slate-400">{name === 'FINALIZADA' ? 'Finalizadas' : name === 'ABERTA' ? 'Abertas' : 'Canceladas'}</p>
        <p className="text-lg font-semibold">{r.vendas_por_status[name].vendas}</p>
        <p className="text-xs text-slate-400">{name === 'FINALIZADA' ? 'compõem o faturamento' : 'fora do faturamento'} · {reais(r.vendas_por_status[name].valor)}</p>
      </div>)}
    </div>}

    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="Faturamento no período" note="Somente vendas FINALIZADAS, pela data local da venda. Barras cinza: intervalo sem registros." state={serie}>
        {serie.data && (serie.data.pontos.every(p => p.sem_registro) ? <p className="text-sm text-slate-400">Nenhuma venda finalizada no período.</p>
          : <div className="h-64"><ResponsiveContainer width="100%" height="100%">
            <BarChart data={serie.data.pontos.map(p => ({ ...p, valor: p.sem_registro ? 0 : num(p.faturamento), rotulo: br(p.periodo).slice(0, agrupamento === 'mes' ? 10 : 5) }))} margin={{ left: 8, right: 8 }}>
              <CartesianGrid vertical={false} stroke="#1e293b" />
              <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} minTickGap={8} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={64} tickFormatter={value => 'R$ ' + value} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#1e293b' }}
                formatter={(_value, _name, item) => [item.payload.sem_registro ? 'Sem registros' : reais(item.payload.faturamento) + ' · ' + item.payload.vendas + ' venda(s)', 'Faturamento']}
                labelFormatter={(_label, items) => items?.[0] ? (agrupamento === 'semana' ? 'Semana de ' : '') + br(items[0].payload.periodo) : ''} />
              <Bar dataKey="valor" radius={[4, 4, 0, 0]} maxBarSize={40} minPointSize={2}>
                {serie.data.pontos.map(p => <Cell key={p.periodo} fill={p.sem_registro ? EMPTY : BAR} />)}
              </Bar>
            </BarChart></ResponsiveContainer></div>)}
      </Panel>

      <Panel title="Valores aplicados por forma de pagamento" note="pagamento.valor de vendas FINALIZADAS. Recebido e troco são informativos e não somam ao faturamento." state={pagamentos}>
        {pagamentos.data && (pagamentos.data.formas.length === 0 ? <p className="text-sm text-slate-400">Nenhum pagamento no período.</p> : <>
          <div style={{ height: 48 + pagamentos.data.formas.length * 36 }}><ResponsiveContainer width="100%" height="100%">
            <BarChart layout="vertical" data={pagamentos.data.formas.map(f => ({ ...f, valor: num(f.aplicado) }))} margin={{ left: 8, right: 88 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="descricao" width={120} tick={{ fontSize: 12, fill: '#cbd5e1' }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#1e293b' }} formatter={(_v, _n, item) => [reais(item.payload.aplicado) + ' · ' + item.payload.pagamentos + ' pagamento(s)', 'Aplicado']} />
              <Bar dataKey="valor" fill={BAR} radius={[0, 4, 4, 0]} maxBarSize={22}>
                <LabelList dataKey="aplicado" position="right" fill="#cbd5e1" fontSize={12} formatter={(value: unknown) => reais(String(value))} />
              </Bar>
            </BarChart></ResponsiveContainer></div>
          <dl className="mt-3 grid grid-cols-3 gap-2 rounded bg-slate-950 p-3 text-sm">
            <div><dt className="text-slate-400">Dinheiro recebido</dt><dd className="font-semibold">{reais(pagamentos.data.dinheiro_fisico.recebido)}</dd></div>
            <div><dt className="text-slate-400">Troco devolvido</dt><dd className="font-semibold">{reais(pagamentos.data.dinheiro_fisico.troco)}</dd></div>
            <div><dt className="text-slate-400">Aplicado em dinheiro</dt><dd className="font-semibold">{reais(pagamentos.data.dinheiro_fisico.aplicado)}</dd></div>
          </dl>
          <p className="mt-2 text-xs text-slate-400">Conferência: faturamento das vendas {reais(pagamentos.data.conciliacao.faturamento_vendas)} = soma aplicada {reais(pagamentos.data.conciliacao.total_aplicado)} (diferença {reais(pagamentos.data.conciliacao.diferenca)}). {pagamentos.data.vendas_com_pagamento_multiplo} venda(s) com mais de uma forma.</p>
        </>)}
      </Panel>
    </div>

    <Panel title="Produtos mais vendidos (por receita)" note="Itens de vendas FINALIZADAS, sem itens cancelados, pelos subtotais gravados na venda. Quantidades de UN, KG e L não são somadas entre si." state={produtos}>
      {produtos.data && (produtos.data.ranking.length === 0 ? <p className="text-sm text-slate-400">Nenhum item vendido no período.</p> : <div className="grid gap-4 lg:grid-cols-2">
        <div style={{ height: 48 + produtos.data.ranking.length * 34 }}><ResponsiveContainer width="100%" height="100%">
          <BarChart layout="vertical" data={produtos.data.ranking.map(p => ({ ...p, valor: num(p.receita) }))} margin={{ left: 8, right: 88 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="nome" width={150} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#1e293b' }} formatter={(_v, _n, item) => [reais(item.payload.receita) + ' · ' + qty(item.payload.quantidade, item.payload.unidade_medida), 'Receita']} />
            <Bar dataKey="valor" fill={BAR} radius={[0, 4, 4, 0]} maxBarSize={20}>
              <LabelList dataKey="receita" position="right" fill="#cbd5e1" fontSize={11} formatter={(value: unknown) => reais(String(value))} />
            </Bar>
          </BarChart></ResponsiveContainer></div>
        <div className="space-y-3">
          <Table head={['#', 'Produto', 'Quantidade', 'Receita']} empty="" rows={produtos.data.ranking.map(p => [p.posicao, p.nome, qty(p.quantidade, p.unidade_medida), reais(p.receita)])} />
          <Table head={['Unidade', 'Quantidade', 'Receita', 'Produtos']} empty="" rows={produtos.data.por_unidade.map(u => [u.unidade_medida, qty(u.quantidade, u.unidade_medida), reais(u.receita), u.produtos])} />
        </div>
      </div>)}
    </Panel>

    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="Alertas de estoque" note={estoque.data ? 'Saldo físico = soma dos lotes. Disponível exclui lotes vencidos. Referência: ' + br(estoque.data.hoje) + '.' : undefined} state={estoque}>
        {estoque.data && <>
          <div className="mb-3 flex flex-wrap gap-2 text-xs">{Object.entries({ 'Abaixo do mínimo': estoque.data.totais.abaixo_minimo, 'Acima do máximo': estoque.data.totais.acima_maximo,
            'Sem lotes': estoque.data.totais.sem_lotes, 'Lotes vencidos': estoque.data.totais.lotes_vencidos, 'Lotes próximos': estoque.data.totais.lotes_proximos, 'Lotes sem validade': estoque.data.totais.lotes_sem_validade })
            .map(([label, value]) => <span key={label} className="rounded-full border border-slate-800 px-2 py-1">{label}: <strong>{value}</strong></span>)}</div>
          <Table head={['Produto', 'Código', 'Físico', 'Disponível', 'Mín.', 'Máx.', 'Situação']} empty="Nenhum produto cadastrado."
            rows={estoque.data.produtos.filter(p => p.situacao !== 'NORMAL' || p.vencido !== '0.000').map(p => [p.nome + (p.ativo ? '' : ' (inativo)'), p.codigo_barras,
              qty(p.fisico, p.unidade_medida), qty(p.disponivel, p.unidade_medida), qty(p.estoque_minimo, p.unidade_medida), qty(p.estoque_maximo, p.unidade_medida),
              <span className="flex flex-wrap items-center gap-1"><Badge status={p.situacao} />{p.vencido !== '0.000' && <Badge status="VENCIDO">vencido {qty(p.vencido, p.unidade_medida)}</Badge>}</span>])} />
        </>}
      </Panel>
      <Panel title="Lotes que exigem atenção" note={estoque.data ? 'Vencidos, vencendo em até 30 dias e sem data de validade (com saldo positivo).' : undefined} state={estoque}>
        {estoque.data && <Table head={['Lote', 'Produto', 'Validade', 'Saldo', 'Situação']} empty="Nenhum lote em alerta."
          rows={estoque.data.lotes.map(l => [l.codigo_lote, l.produto, l.data_validade ? br(l.data_validade) : '—', qty(l.quantidade_atual, l.unidade_medida), <Badge status={l.situacao} />])} />}
      </Panel>
    </div>

    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="Pedidos de compra" note="Valor pelos custos históricos dos itens do pedido; cancelados fora do total estimado. Compras não são faturamento." state={compras}>
        {compras.data && <>
          <div className="mb-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">{['PENDENTE', 'ENVIADO', 'RECEBIDO', 'CANCELADO'].map(name => <div key={name} className="rounded border border-slate-800 p-2">
            <p className="text-xs text-slate-400">{name}</p><p className="font-semibold">{compras.data.por_status[name].pedidos}</p><p className="text-xs">{reais(compras.data.por_status[name].valor)}</p></div>)}</div>
          <p className="mb-2 text-sm">Total estimado (sem cancelados): <strong>{reais(compras.data.valor_estimado)}</strong> em {compras.data.total_pedidos} pedido(s).</p>
          <h3 className="text-sm font-medium">Aguardando recebimento</h3>
          <Table head={['Pedido', 'Fornecedor', 'Status', 'Previsto', 'Valor']} empty="Nenhum pedido aguardando recebimento."
            rows={compras.data.aguardando_recebimento.map(p => ['#' + p.id_pedido, p.fornecedor, <Badge status={p.status} />, <span className="flex flex-wrap items-center gap-1">{p.data_prevista ? br(p.data_prevista) : 'sem data'}{p.atrasado && <Badge tone="danger">atrasado</Badge>}</span>, reais(p.valor)])} />
        </>}
      </Panel>
      <Panel title="Fornecedores" note="Atraso: recebido em data local posterior à prevista; pedidos sem data prevista não entram nessa contagem." state={fornecedores}>
        {fornecedores.data && <Table head={['Fornecedor', 'Pedidos', 'Recebidos', 'Valor (sem cancelados)', 'Produtos', 'Atrasos']} empty="Nenhum fornecedor."
          rows={fornecedores.data.items.filter(f => f.pedidos > 0).map(f => [f.fornecedor, f.pedidos, f.recebidos, reais(f.valor_total), f.produtos_fornecidos, f.recebidos_com_prazo ? f.recebidos_com_atraso + ' de ' + f.recebidos_com_prazo : '—'])} />}
      </Panel>
    </div>

    <Panel title="Sessões de caixa" note="Conferência pela mesma regra do Script 07: fundo + dinheiro aplicado em vendas finalizadas. Inclui as sessões abertas e as abertas no período." state={caixas}>
      {caixas.data && <>
        <p className="mb-2 text-sm">{caixas.data.abertas} aberta(s) · {caixas.data.fechadas} fechada(s) no período.</p>
        <Table head={['Sessão', 'Terminal', 'Operador', 'Abertura', 'Situação', 'Fundo', 'Esperado', 'Contado', 'Diferença']} empty="Nenhuma sessão."
          rows={caixas.data.sessoes.map(s => ['#' + s.id_sessao, s.numero, s.matricula, localTime(s.data_abertura), <span className="flex flex-wrap items-center gap-1"><Badge status={s.situacao} />{s.vendas_abertas > 0 && <span className="text-xs text-slate-400">{s.vendas_abertas} venda(s) aberta(s)</span>}</span>,
            reais(s.fundo_troco), reais(s.valor_esperado), s.valor_contado ? reais(s.valor_contado) : '—', s.diferenca ? <span className="flex items-center gap-1 whitespace-nowrap">{reais(s.diferenca)}{s.resultado && <Badge status={s.resultado} />}</span> : '—'])} />
        <h3 className="mt-4 text-sm font-medium">Operadores no período</h3>
        <Table head={['Operador', 'Sessões', 'Vendas finalizadas', 'Valor']} empty="Nenhum operador no período."
          rows={caixas.data.operadores.map(o => [o.matricula + ' · ' + o.operador, o.sessoes, o.vendas_finalizadas, reais(o.faturamento)])} />
      </>}
    </Panel>

    <Panel title="Movimentações de estoque" note="AJUSTE é gravado com sinal (+/−). PERDA não é venda; ENTRADA não é faturamento. Totais separados por unidade." state={movimentos}>
      {movimentos.data && <>
        <div className="mb-2 flex flex-wrap gap-2 text-sm">{['', 'ENTRADA', 'SAIDA_VENDA', 'PERDA', 'AJUSTE'].map(tipo => <button key={tipo} className={buttonClass + ((params.get('tipo') ?? '') === tipo ? ' ring-2 ring-emerald-700' : '')}
          onClick={() => { const next = new URLSearchParams(params); if (tipo) next.set('tipo', tipo); else next.delete('tipo'); setParams(next); }}>{tipo || 'Todos'}</button>)}</div>
        <Table head={['Tipo', 'Unidade', 'Movimentações', 'Saldo', 'Positivo', 'Negativo']} empty="Nenhuma movimentação no período."
          rows={movimentos.data.totais.map(t => [<Badge status={t.tipo} />, t.unidade_medida, t.movimentacoes, t.quantidade, t.positivo, t.negativo])} />
        <div className="mt-3"><Table head={['Data', 'Tipo', 'Produto', 'Lote', 'Quantidade', 'Observação']} empty=""
          rows={movimentos.data.items.map(m => [localTime(m.data_hora), <Badge status={m.tipo} />, m.produto, m.codigo_lote, qty(m.quantidade, m.unidade_medida), m.observacao ?? '—'])} /></div>
        {movimentos.data.mais && <p className="mt-2 text-xs text-slate-400">Mostrando as 20 mais recentes. Refine o período ou o tipo.</p>}
      </>}
    </Panel>
  </section>;
}
