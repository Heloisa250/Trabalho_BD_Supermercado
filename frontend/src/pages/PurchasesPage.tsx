import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminRequest, json, optionsFor, reais } from '../services/admin';
import type { Employee } from '../services/auth';
import { buttonClass, inputClass } from './adminFields';
import { ReceiveOrder } from './ReceiveOrder';

type Order = {
  id_pedido: number; id_fornecedor: number; fornecedor: string; funcionario: string;
  data_pedido: string; data_prevista: string | null; observacao: string | null;
  data_recebimento: string | null; status: 'PENDENTE' | 'ABERTO' | 'ENVIADO' | 'CANCELADO' | 'RECEBIDO'; quantidade_itens: number; total_estimado: string;
};
type Line = { id_produto: number; nome: string; codigo_barras: string; unidade_medida: string; quantidade: string; custo_unitario: string; subtotal: string };
type Offer = Pick<Line, 'id_produto' | 'nome' | 'codigo_barras' | 'unidade_medida'> & { preco_custo: string };
type Page<T> = { items: T[]; mais: boolean; pagina: number };
const endpoint = 'pedidos-compra';
const editable = import.meta.env.MODE === 'official' ? 'PENDENTE' : 'ABERTO';
const states = [editable, 'ENVIADO', 'CANCELADO', 'RECEBIDO'];

function date(value?: string | null) {
  return value ? value.slice(0, 10).split('-').reverse().join('/') : '—';
}
function fixed(value: string, scale: number) {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole + fraction.padEnd(scale, '0'));
}
function amount(cents: bigint) {
  const text = cents.toString().padStart(3, '0');
  return text.slice(0, -2) + '.' + text.slice(-2);
}
function lineCents(quantity: string, cost: string) {
  return (fixed(quantity, 3) * fixed(cost, 2) + 500n) / 1000n;
}
function valid(quantity: string, cost: string) {
  return /^\d{1,7}(\.\d{1,3})?$/.test(quantity) && /[1-9]/.test(quantity) && /^\d{1,8}(\.\d{1,2})?$/.test(cost);
}
function quantityLabel(quantity: string) {
  return quantity.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '').replace('.', ',');
}

function ItemForm({ supplier, editing, onSave, busy }: {
  supplier: number; editing?: Line; onSave: (line: Line) => void; busy: boolean;
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Offer>();
  const [quantity, setQuantity] = useState(editing?.quantidade ?? '1');
  const [cost, setCost] = useState(editing?.custo_unitario ?? '');
  const offers = useQuery({ queryKey: ['admin', endpoint, 'offers', supplier, search, page], enabled: supplier > 0 && !editing,
    queryFn: ({ signal }) => adminRequest<Page<Offer>>(endpoint + '/fornecedor/' + supplier + '/produtos?' + new URLSearchParams({ busca: search, pagina: String(page) }), { signal }) });
  const q = quantity.replace(',', '.');
  const c = cost.replace(',', '.');
  const candidate = editing ?? selected;
  const subtotal = valid(q, c) ? amount(lineCents(q, c)) : undefined;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!candidate || !subtotal) return;
    onSave({ id_produto: candidate.id_produto, nome: candidate.nome, codigo_barras: candidate.codigo_barras,
      unidade_medida: candidate.unidade_medida, quantidade: q, custo_unitario: c, subtotal });
    if (!editing) { setSelected(undefined); setCost(''); setQuantity('1'); }
  }
  return <form className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2" onSubmit={submit}>
    {editing ? <p className="font-semibold sm:col-span-2">Editar {editing.nome}</p> : <>
      <label className="grid gap-1 text-sm">Pesquisar produtos do fornecedor
        <input className={inputClass} value={search} maxLength={120} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </label>
      <label className="grid gap-1 text-sm">Produto<select className={inputClass} required
        value={selected?.id_produto ?? ''} onChange={(e) => {
          const offer = offers.data?.items.find((row) => row.id_produto === Number(e.target.value));
          setSelected(offer); setCost(offer?.preco_custo ?? '');
        }}>
        <option value="">Selecione</option>
        {selected && !offers.data?.items.some((row) => row.id_produto === selected.id_produto) &&
          <option value={selected.id_produto}>{selected.nome}</option>}
        {offers.data?.items.map((row) => <option key={row.id_produto} value={row.id_produto}>{row.nome} · {row.codigo_barras}</option>)}
      </select></label>
      {offers.isPending && <p role="status">Carregando produtos…</p>}
      {offers.isError && <p role="alert">{offers.error.message}</p>}
      {offers.data?.items.length === 0 && <p>Nenhum produto encontrado.</p>}
      {(page > 1 || offers.data?.mais) && <div className="flex gap-2">
        <button className={buttonClass} type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</button>
        <button className={buttonClass} type="button" disabled={!offers.data?.mais} onClick={() => setPage(page + 1)}>Próxima</button>
      </div>}
    </>}
    <label className="grid gap-1 text-sm">Quantidade<input className={inputClass} inputMode="decimal" required
      value={quantity} onChange={(e) => setQuantity(e.target.value)} /></label>
    <label className="grid gap-1 text-sm">Custo unitário<input className={inputClass} inputMode="decimal" required
      value={cost} onChange={(e) => setCost(e.target.value)} /></label>
    <p className="text-sm">Subtotal {subtotal ? reais(subtotal) : '—'}</p>
    <button className={buttonClass} disabled={busy || !candidate || !subtotal}>{editing ? 'Salvar item' : 'Adicionar item'}</button>
  </form>;
}

function Lines({ lines, onEdit }: { lines: Line[]; onEdit?: (line: Line) => void }) {
  if (!lines.length) return <p>Nenhum item no pedido.</p>;
  return <div className="overflow-x-auto"><table className="w-full text-left text-sm">
    <thead className="bg-slate-100"><tr>{['Produto', 'Código', 'Quantidade', 'Unidade', 'Custo', 'Subtotal', ...(onEdit ? ['Ação'] : [])]
      .map((label) => <th key={label} className="p-2">{label}</th>)}</tr></thead>
    <tbody>{lines.map((line) => <tr key={line.id_produto} className="border-b border-slate-200">
      {[line.nome, line.codigo_barras, quantityLabel(line.quantidade), line.unidade_medida, reais(line.custo_unitario), reais(line.subtotal)]
        .map((value, i) => <td key={i} className="p-2">{value}</td>)}
      {onEdit && <td className="p-2"><button className={buttonClass} onClick={() => onEdit(line)}>Editar</button></td>}
    </tr>)}</tbody>
  </table></div>;
}

export function PurchasesPage({ employee }: { employee: Employee }) {
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<number>();
  const [supplier, setSupplier] = useState(0);
  const [draft, setDraft] = useState<Line[]>([]);
  const [editing, setEditing] = useState<Line>();
  const [confirm, setConfirm] = useState<'enviar' | 'cancelar'>();
  const [receiving, setReceiving] = useState(false);
  const [notice, setNotice] = useState('');
  const [draftError, setDraftError] = useState('');
  const vendors = useQuery({ queryKey: ['admin', 'fornecedores', 'options'], queryFn: ({ signal }) => optionsFor('fornecedores', signal) });
  const orders = useQuery({ queryKey: ['admin', endpoint, params.toString()],
    queryFn: ({ signal }) => adminRequest<Page<Order>>(endpoint + '?' + params, { signal }) });
  const path = endpoint + '/' + selected;
  const order = useQuery({ queryKey: ['admin', endpoint, 'detail', selected], enabled: selected !== undefined,
    queryFn: ({ signal }) => adminRequest<Order>(path, { signal }) });
  const items = useQuery({ queryKey: ['admin', endpoint, 'items', selected], enabled: selected !== undefined,
    queryFn: ({ signal }) => adminRequest<Line[]>(path + '/itens', { signal }) });
  const save = useMutation({
    mutationFn: ({ route, method, body }: { route: string; method: 'POST' | 'PATCH'; body: object }) => adminRequest<Order>(route, json(method, body)),
    onSuccess: async (result, action) => {
      setNotice('Alteração salva.');
      setEditing(undefined);
      setConfirm(undefined);
      if (action.route === endpoint) {
        setCreating(false);
        setDraft([]);
        setSupplier(0);
        setSelected(result.id_pedido);
      }
      await client.invalidateQueries({ queryKey: ['admin', endpoint] });
    },
  });

  function selectOrder(id?: number) {
    setReceiving(false);
    setSelected(id); setEditing(undefined); setConfirm(undefined); setCreating(false); setNotice(''); save.reset();
  }
  function saveOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const vendor = Number(form.get('id_fornecedor'));
    const fields = { ...(vendor && { id_fornecedor: vendor }), data_prevista: String(form.get('data_prevista') ?? '') || null,
      observacao: String(form.get('observacao') ?? '').trim() || null };
    setNotice('');
    save.mutate(creating
      ? { route: endpoint, method: 'POST', body: { ...fields, itens: draft.map(({ id_produto, quantidade, custo_unitario }) => ({ id_produto, quantidade, custo_unitario })) } }
      : { route: path, method: 'PATCH', body: fields });
  }
  function changePage(page: number) { const next = new URLSearchParams(params); next.set('pagina', String(page)); setParams(next); }

  function confirmAction(action: 'enviar' | 'cancelar') {
    save.reset();
    setConfirm(action);
  }

  return <section className="min-w-0 p-4 sm:p-8">
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">Pedidos de Compra</h1>
      <button className={buttonClass} disabled={save.isPending} onClick={() => { selectOrder(); setSupplier(0); setDraft([]); setDraftError(''); setCreating(true); }}>Novo pedido</button></header>
    <form key={params.toString()} className="mb-4 flex flex-wrap items-end gap-3" onSubmit={(event) => {
      event.preventDefault(); const next = new URLSearchParams();
      for (const [key, value] of new FormData(event.currentTarget)) if (value) next.set(key, String(value));
      setParams(next);
    }}>
      {([['numero', 'Número', 'number'], ['funcionario', 'ID do responsável', 'number'], ['inicio', 'De', 'date'], ['fim', 'Até', 'date']] as const)
        .map(([key, label, type]) => <label key={key} className="grid gap-1 text-sm">{label}
          <input className={inputClass} name={key} type={type} min={type === 'number' ? 1 : undefined} defaultValue={params.get(key) ?? ''} /></label>)}
      <label className="grid gap-1 text-sm">Fornecedor<select className={inputClass} name="fornecedor" defaultValue={params.get('fornecedor') ?? ''}>
        <option value="">Todos</option>{vendors.data?.map((row) => <option key={row.id} value={row.id}>{row.razao_social}</option>)}
      </select></label>
      <label className="grid gap-1 text-sm">Status<select className={inputClass} name="status" defaultValue={params.get('status') ?? ''}>
        <option value="">Todos</option>{states.map((state) => <option key={state}>{state}</option>)}
      </select></label>
      <label className="grid gap-1 text-sm">Ordenar por<select className={inputClass} name="ordem" defaultValue={params.get('ordem') ?? 'data'}>
        <option value="data">Data</option><option value="numero">Número</option>
      </select></label>
      <label className="grid gap-1 text-sm">Ordem<select className={inputClass} name="direcao" defaultValue={params.get('direcao') ?? 'desc'}>
        <option value="desc">Decrescente</option><option value="asc">Crescente</option>
      </select></label>
      <button className={buttonClass}>Pesquisar</button>
    </form>
    {orders.isPending && <p role="status">Carregando pedidos…</p>}
    {orders.isError && <p role="alert">{orders.error.message}</p>}
    {vendors.isError && <p role="alert">{vendors.error.message}</p>}
    {orders.data?.items.length === 0 && <p>Nenhum pedido encontrado.</p>}
    {!!orders.data?.items.length && <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white"><table className="w-full text-left text-sm">
      <thead className="bg-slate-100"><tr>{['Pedido', 'Fornecedor', 'Responsável', 'Criação', 'Previsão', 'Status', 'Itens', 'Total', 'Ação']
        .map((label) => <th key={label} className="p-2">{label}</th>)}</tr></thead>
      <tbody>{orders.data.items.map((row) => <tr key={row.id_pedido} className="border-t border-slate-200">
        {[row.id_pedido, row.fornecedor, row.funcionario, date(row.data_pedido), date(row.data_prevista), row.status, row.quantidade_itens, reais(row.total_estimado)]
          .map((value, i) => <td key={i} className="p-2">{i === 5 ? <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-900">{value}</span> : value}</td>)}
        <td className="p-2"><button className={buttonClass} disabled={save.isPending} onClick={() => selectOrder(row.id_pedido)}>Detalhes</button></td>
      </tr>)}</tbody>
    </table></div>}
    {orders.data && <nav className="my-3 flex items-center gap-2" aria-label="Paginação de pedidos">
      <button className={buttonClass} disabled={orders.data.pagina === 1} onClick={() => changePage(orders.data!.pagina - 1)}>Anterior</button>
      <span>Página {orders.data.pagina}</span>
      <button className={buttonClass} disabled={!orders.data.mais} onClick={() => changePage(orders.data!.pagina + 1)}>Próxima</button>
    </nav>}
    {selected !== undefined && (order.isPending || items.isPending) && <p role="status">Carregando detalhes…</p>}
    {selected !== undefined && (order.isError || items.isError) && <p role="alert">{order.error?.message ?? items.error?.message}</p>}
    {(creating || order.data) && <section className="mt-6 grid gap-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex justify-between gap-3"><h2 className="text-xl font-semibold">{creating ? 'Novo pedido' : 'Pedido #' + selected}</h2>
        <button className={buttonClass} disabled={save.isPending} onClick={() => selectOrder()}>Fechar</button></div>
      {notice && <p role="status" className="text-emerald-800">{notice}</p>}
      {save.isError && <p role="alert" className="text-red-800">{save.error.message}</p>}
      <p>Responsável: {creating ? employee.nome : order.data?.funcionario}</p>
      {order.data && <p>Fornecedor: {order.data.fornecedor} · Criado em {date(order.data.data_pedido)} · {order.data.status}</p>}
      {order.data?.data_recebimento && <p>Recebido em {date(order.data.data_recebimento)} {order.data.data_recebimento.slice(11)}</p>}
      {(creating || order.data?.status === editable) ? <form key={creating ? 'new' : selected} onSubmit={saveOrder}
        id="purchase-header" className="grid gap-3 sm:grid-cols-2">
        {(creating || order.data?.quantidade_itens === 0) && <label className="grid gap-1 text-sm">Fornecedor
          <select className={inputClass} name="id_fornecedor" required defaultValue={order.data?.id_fornecedor ?? ''}
            onChange={(event) => { if (creating) { setSupplier(Number(event.target.value)); setDraft([]); setEditing(undefined); setDraftError(''); } }}>
            <option value="">Selecione</option>{vendors.data?.filter((row) => row.ativo === 1 || row.id === order.data?.id_fornecedor)
              .map((row) => <option key={row.id} value={row.id}>{row.razao_social}</option>)}
          </select></label>}
        <label className="grid gap-1 text-sm">Previsão de entrega<input className={inputClass} type="date" name="data_prevista" defaultValue={order.data?.data_prevista ?? ''} /></label>
        <label className="grid gap-1 text-sm sm:col-span-2">Observação<textarea className={inputClass} name="observacao" maxLength={255} defaultValue={order.data?.observacao ?? ''} /></label>
      </form> : <p>Previsão {date(order.data?.data_prevista)} · {order.data?.observacao || 'Sem observação'}</p>}
      {creating && <>
        <Lines lines={draft} onEdit={setEditing} />
        {draftError && <p role="alert">{draftError}</p>}
        {supplier > 0 && <ItemForm key={supplier + ':' + (editing?.id_produto ?? '')} supplier={supplier} editing={editing} busy={save.isPending}
          onSave={(line) => {
            if (!editing && draft.some((row) => row.id_produto === line.id_produto)) { setDraftError('Produto já incluído. Edite o item existente.'); return; }
            setDraftError(''); setDraft(editing ? draft.map((row) => row.id_produto === line.id_produto ? line : row) : [...draft, line]);
            setEditing(undefined);
          }} />}
        <p>{draft.length} itens · Total estimado {reais(amount(draft.reduce((sum, line) => sum + lineCents(line.quantidade, line.custo_unitario), 0n)))}</p>
      </>}
      {order.data && items.data && <>
        <Lines lines={items.data} onEdit={order.data.status === editable ? setEditing : undefined} />
        {order.data.status === editable && <p className="text-sm text-slate-600">Itens gravados podem ser editados enquanto o pedido estiver pendente. A remoção individual não está disponível.</p>}
        <p>{order.data.quantidade_itens} itens · Total estimado {reais(order.data.total_estimado)}</p>
        {order.data.status === editable && <ItemForm key={selected + ':' + (editing?.id_produto ?? '')} supplier={order.data.id_fornecedor}
          editing={editing} busy={save.isPending} onSave={({ id_produto, quantidade, custo_unitario }) => {
            setNotice('');
            save.mutate(editing ? { route: path + '/itens/' + id_produto, method: 'PATCH', body: { quantidade, custo_unitario } }
              : { route: path + '/itens', method: 'POST', body: { id_produto, quantidade, custo_unitario } });
          }} />}
      </>}
      {editing && <button className={buttonClass} disabled={save.isPending} onClick={() => setEditing(undefined)}>Cancelar edição do item</button>}
      <div className="flex flex-wrap gap-2">
        {(creating || order.data?.status === editable) && <button className={buttonClass} form="purchase-header" disabled={save.isPending}>{save.isPending ? 'Salvando…' : creating ? 'Criar pedido' : 'Salvar pedido'}</button>}
        {order.data?.status === editable && <button className={buttonClass} disabled={!order.data.quantidade_itens || save.isPending} onClick={() => confirmAction('enviar')}>Enviar pedido</button>}
        {(order.data?.status === editable || (order.data?.status === 'ENVIADO' && !order.data.data_recebimento)) && <button className={buttonClass} disabled={save.isPending} onClick={() => confirmAction('cancelar')}>Cancelar pedido</button>}
        {import.meta.env.MODE === 'official' && order.data?.status === 'ENVIADO' && !order.data.data_recebimento && !!items.data?.length &&
          <button className={buttonClass} disabled={save.isPending} onClick={() => setReceiving(true)}>Receber mercadorias</button>}
      </div>
    </section>}
    {receiving && selected !== undefined && items.data && <ReceiveOrder order={selected} items={items.data}
      close={() => setReceiving(false)} received={() => { setReceiving(false); setNotice('Recebimento registrado.'); }} />}
    {confirm && <dialog ref={(node) => { if (node && !node.open) node.showModal(); }}
      onCancel={(event) => { event.preventDefault(); if (!save.isPending) setConfirm(undefined); }}
      className="fixed inset-0 m-auto w-[min(90vw,28rem)] rounded-xl bg-white p-6 shadow-xl backdrop:bg-black/40">
      <h2 className="font-semibold">{confirm === 'enviar' ? 'Enviar este pedido?' : 'Cancelar este pedido?'}</h2>
      {save.isError && <p role="alert">{save.error.message}</p>}
      <div className="mt-4 flex gap-2"><button className={buttonClass} disabled={save.isPending} onClick={() => setConfirm(undefined)}>Voltar</button>
        <button className={buttonClass} disabled={save.isPending} onClick={() => save.mutate({ route: path + '/' + confirm, method: 'POST', body: {} })}>Confirmar</button></div>
    </dialog>}
  </section>;
}
