import { Badge } from '../components/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { json, reais } from '../services/admin';
import { sessionKey, type Employee } from '../services/auth';
import { buttonClass, inputClass } from './adminFields';
import { api, HttpError, PdvPayment, ReceiptView, type Receipt } from './PdvPayment';

type Unit = 'UN' | 'KG' | 'L';
type Product = { id_produto: number; codigo_barras: string; nome: string; unidade_medida: Unit; preco_venda: string; ativo: boolean; disponivel: string; vencido: string };
type Item = { id_item_venda: number; id_produto: number; nome: string; codigo_barras: string; unidade_medida: Unit; quantidade: string;
  preco_unitario: string; subtotal: string | null; situacao: 'ATIVO' | 'CANCELADO';
  cancelamento: { id_cancelamento: number; data_hora: string; motivo: string; supervisor: string } | null };
type Sale = { id_venda: number; id_sessao: number; data_hora: string; valor_total: string; status: string; numero_caixa: number; itens: Item[]; itens_ativos: number };
type Active = { sessao: { id_sessao: number; numero_caixa: number; caixa_ativo: boolean; data_abertura: string } | null; venda: Sale | null };


const key = ['pdv', 'ativa'];
const qty = (value: string, unit: Unit) => unit === 'UN' ? value.split('.')[0] : value.replace('.', ',');
const normalize = (value: string) => value.trim().replace(',', '.');
const validQty = (value: string, unit: Unit) => (unit === 'UN' ? /^\d{1,7}$/ : /^\d{1,7}(?:\.\d{1,3})?$/).test(value) && /[1-9]/.test(value);

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(timer); }, []);
  return <time dateTime={now.toISOString()}>{now.toLocaleString('pt-BR')}</time>;
}

export function PdvPage({ employee }: { employee: Employee }) {
  const client = useQueryClient();
  const scan = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<Product>();
  const [amount, setAmount] = useState('1');
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string }>();
  const [editing, setEditing] = useState<{ item: Item; value: string }>();
  const [cancelling, setCancelling] = useState<Item>();
  const [confirmSale, setConfirmSale] = useState(false);
  const [paying, setPaying] = useState(false);
  // O comprovante fica na URL (?comprovante=ID) para sobreviver a F5.
  const [params, setParams] = useSearchParams();
  const receiptId = Number(params.get('comprovante')) || undefined;
  const receipt = useQuery({ queryKey: ['pdv', 'comprovante', receiptId], enabled: receiptId !== undefined,
    queryFn: ({ signal }) => api<Receipt>('vendas/' + receiptId + '/comprovante', { signal }) });

  const onError = (error: Error) => {
    if (error instanceof HttpError && error.status === 401) void client.invalidateQueries({ queryKey: sessionKey });
    setNotice({ kind: 'error', text: error.message });
  };
  const active = useQuery({ queryKey: key, queryFn: ({ signal }) => api<Active>('vendas/ativa', { signal }) });
  useEffect(() => { if (active.error instanceof HttpError && active.error.status === 401) void client.invalidateQueries({ queryKey: sessionKey }); }, [active.error, client]);
  const results = useQuery({
    queryKey: ['pdv', 'busca', search], enabled: search.length >= 2,
    queryFn: ({ signal }) => api<Product[]>('vendas/produtos?busca=' + encodeURIComponent(search), { signal }),
  });
  const sale = active.data?.venda;
  const focusScan = () => { setTimeout(() => scan.current?.focus(), 0); };
  useEffect(focusScan, [sale?.id_venda]);

  const setSale = (next: Sale) => client.setQueryData<Active>(key, current => current && { ...current, venda: next.status === 'ABERTA' ? next : null });
  // Trava síncrona contra duplo clique; o servidor também recupera a venda aberta em vez de criar outra.
  const opening = useRef(false);
  const open = useMutation({ mutationFn: () => api<Sale & { recuperada?: boolean }>('vendas', json('POST', {})), onError,
    onSettled: () => { opening.current = false; },
    onSuccess: next => { setSale(next); setNotice({ kind: 'ok', text: next.recuperada
      ? 'Venda #' + next.id_venda + ' já estava aberta nesta sessão e foi recuperada.' : 'Venda #' + next.id_venda + ' iniciada.' }); } });
  const startSale = () => { if (opening.current || busy) return; opening.current = true; setParams({}); open.mutate(); };
  const lookup = useMutation({
    mutationFn: (barcode: string) => api<Product[]>('vendas/produtos?codigo_barras=' + encodeURIComponent(barcode)),
    onError: (error: Error) => { setFound(undefined); onError(error); },
  });
  const add = useMutation({
    mutationFn: (body: object) => api<Sale>('vendas/' + sale!.id_venda + '/itens', json('POST', body)), onError,
    onSuccess: (next, body) => {
      setSale(next);
      const name = found?.nome ?? next.itens.at(-1)?.nome;
      setNotice({ kind: 'ok', text: '✓ ' + (name ?? 'Produto') + ' adicionado (' + ('codigo_barras' in body ? 'leitura' : 'seleção') + ').' });
      setCode(''); setAmount('1'); focusScan();
    },
  });
  const edit = useMutation({
    mutationFn: ({ item, value }: { item: Item; value: string }) => api<Sale>('vendas/' + sale!.id_venda + '/itens/' + item.id_item_venda, json('PATCH', { quantidade: value })),
    onError, onSuccess: next => { setSale(next); setEditing(undefined); setNotice({ kind: 'ok', text: 'Quantidade atualizada.' }); focusScan(); },
  });
  const cancelItem = useMutation({
    mutationFn: (body: { item: Item; motivo: string; matricula: string; senha: string }) => api<Sale>(
      'vendas/' + sale!.id_venda + '/itens/' + body.item.id_item_venda + '/cancelar',
      json('POST', { motivo: body.motivo, supervisor: { matricula: body.matricula, senha: body.senha } })),
    onSuccess: next => { setSale(next); setCancelling(undefined); setNotice({ kind: 'ok', text: 'Item cancelado com autorização do supervisor.' }); focusScan(); },
    onError,
  });
  const cancelSale = useMutation({
    mutationFn: () => api<Sale>('vendas/' + sale!.id_venda + '/cancelar', json('POST', { confirmar: true })), onError,
    onSuccess: next => { setSale(next); setConfirmSale(false); setNotice({ kind: 'ok', text: 'Venda #' + next.id_venda + ' cancelada.' }); },
  });
  const busy = open.isPending || add.isPending || edit.isPending || cancelItem.isPending || cancelSale.isPending;

  // Leitor USB atua como teclado: digita o código e envia Enter. Cada leitura adiciona 1 unidade (ou a quantidade informada).
  async function onScan(event: FormEvent) {
    event.preventDefault();
    const barcode = code.trim();
    // Limpa já na leitura para que a próxima leitura consecutiva não se concatene a esta.
    setCode('');
    if (!barcode || busy) return;
    setNotice(undefined);
    const [product] = await lookup.mutateAsync(barcode).catch(() => [] as Product[]);
    if (!product) return;
    setFound(product);
    const value = normalize(amount);
    if (!sale) { setNotice({ kind: 'error', text: 'Inicie uma venda para adicionar produtos.' }); return; }
    if (!validQty(value, product.unidade_medida)) { setNotice({ kind: 'error', text: 'Informe a quantidade e confirme com Adicionar.' }); return; }
    add.mutate({ codigo_barras: barcode, quantidade: value });
  }
  function addFound() {
    if (!found || !sale || busy) return;
    const value = normalize(amount);
    if (!validQty(value, found.unidade_medida)) {
      setNotice({ kind: 'error', text: found.unidade_medida === 'UN' ? 'Use quantidade inteira maior que zero.' : 'Use até 3 casas decimais, maior que zero.' });
      return;
    }
    add.mutate({ id_produto: found.id_produto, quantidade: value });
  }

  const session = active.data?.sessao;
  if (active.isPending) return <p className="p-8" role="status">Carregando PDV…</p>;
  if (active.isError) return <p className="p-8" role="alert">{active.error.message}</p>;
  return <section className="min-w-0 space-y-4 p-4 sm:p-6">
    <header className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-950 p-4 text-white">
      <div><p className="text-xs uppercase tracking-wide text-slate-400">Supermercado Qualidade Líder</p>
        <h1 className="text-xl font-bold">Frente de Caixa — PDV</h1></div>
      <dl className="grid grid-cols-2 gap-x-4 text-sm sm:grid-cols-5">
        <div><dt className="text-slate-500">Terminal</dt><dd>{session ? session.numero_caixa : '—'}</dd></div>
        <div><dt className="text-slate-500">Operador</dt><dd>{employee.matricula}</dd></div>
        <div><dt className="text-slate-500">Sessão</dt><dd>{session ? '#' + session.id_sessao : '—'}</dd></div>
        <div><dt className="text-slate-500">Venda</dt><dd>{sale ? '#' + sale.id_venda + ' · ' + sale.status : 'Nenhuma'}</dd></div>
        <div className="col-span-2 sm:col-span-1"><dt className="text-slate-500">Data e hora</dt><dd><Clock /></dd></div>
      </dl>
    </header>

    {!session && <div role="alert" className="rounded border border-amber-800 bg-amber-950/40 p-4">
      Nenhuma sessão de caixa aberta para você. <Link className="underline" to="/admin/sessoes-caixa">Abrir caixa</Link>
    </div>}
    {session && !sale && receiptId === undefined && <button className="rounded-lg bg-emerald-700 px-4 py-3 font-semibold text-white disabled:opacity-50" disabled={busy}
      onClick={startSale}>{open.isPending ? 'Iniciando…' : 'Nova venda'}</button>}
    {notice && <p role={notice.kind === 'error' ? 'alert' : 'status'} className={'rounded px-3 py-2 ' + (notice.kind === 'error' ? 'bg-red-950/40 text-red-300' : 'bg-emerald-950/50 text-emerald-400')}>{notice.text}</p>}
    {receiptId !== undefined && (receipt.isPending ? <p role="status">Carregando comprovante…</p>
      : receipt.isError ? <p role="alert">{receipt.error.message}</p>
      : <ReceiptView receipt={receipt.data} onClose={() => setParams({})} onNewSale={session && !sale ? startSale : undefined} />)}
    {paying && sale && <PdvPayment saleId={sale.id_venda} onClose={() => { setPaying(false); focusScan(); }} onDone={done => {
      setPaying(false);
      client.setQueryData(['pdv', 'comprovante', done.id_venda], done);
      setParams({ comprovante: String(done.id_venda) });
      setNotice({ kind: 'ok', text: 'Venda #' + done.id_venda + ' finalizada. Pagamento registrado e estoque baixado.' });
      void client.invalidateQueries({ queryKey: ['pdv'] });
      void client.invalidateQueries({ queryKey: ['admin'] });
    }} />}

    {session && !paying && receiptId === undefined && <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div className="space-y-3 rounded-xl border bg-slate-900 p-4">
        <h2 className="font-semibold">Produtos</h2>
        <form onSubmit={onScan} className="grid gap-2">
          <label className="grid gap-1 text-sm">Código de barras
            <input ref={scan} autoFocus inputMode="numeric" autoComplete="off" maxLength={14} className={inputClass + ' text-lg tracking-wider'}
              value={code} onChange={event => setCode(event.target.value)} placeholder="Leia ou digite e tecle Enter" disabled={!sale} /></label>
        </form>
        <label className="grid gap-1 text-sm">Pesquisar por nome
          <input type="search" className={inputClass} value={search} onChange={event => setSearch(event.target.value)} placeholder="Mínimo de 2 letras" /></label>
        {results.data && <ul className="max-h-48 overflow-y-auto rounded border text-sm">
          {results.data.length === 0 && <li className="p-2 text-slate-400">Nenhum produto encontrado.</li>}
          {results.data.map(product => <li key={product.id_produto}>
            <button type="button" className="w-full p-2 text-left hover:bg-slate-800" onClick={() => { setFound(product); setSearch(''); }}>
              {product.nome} · {reais(product.preco_venda)}/{product.unidade_medida}</button></li>)}
        </ul>}
        {found && <div className="space-y-1 rounded border border-slate-800 bg-slate-950 p-3 text-sm">
          <p className="font-semibold">{found.nome}</p>
          <p>Código {found.codigo_barras} · Unidade {found.unidade_medida}</p>
          <p className="text-lg font-bold">{reais(found.preco_venda)} / {found.unidade_medida}</p>
          <p>Disponível para venda: {qty(found.disponivel, found.unidade_medida)} {found.unidade_medida}
            {found.vencido !== '0.000' && <span className="text-amber-300"> · vencido: {qty(found.vencido, found.unidade_medida)}</span>}</p>
        </div>}
        <div className="flex items-end gap-2">
          <label className="grid flex-1 gap-1 text-sm">Quantidade
            <input className={inputClass} inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} /></label>
          <button className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white disabled:opacity-50" disabled={!found || !sale || busy} onClick={addFound}>
            {add.isPending ? 'Adicionando…' : 'Adicionar'}</button>
        </div>
        <p className="text-xs text-slate-400">A disponibilidade é uma verificação preliminar; o estoque só é baixado na finalização (Script 09).</p>
      </div>

      <div className="min-w-0 space-y-3 rounded-xl border bg-slate-900 p-4">
        <h2 className="font-semibold">Carrinho {sale && '· Venda #' + sale.id_venda}</h2>
        {!sale && <p className="text-slate-400">Inicie uma venda para registrar produtos.</p>}
        {sale && sale.itens.length === 0 && <p className="text-slate-400">Nenhum item registrado.</p>}
        {sale && sale.itens.length > 0 && <ul className="divide-y">{sale.itens.map(item => {
          const cancelled = item.situacao === 'CANCELADO';
          return <li key={item.id_item_venda} className={'grid gap-1 py-2 text-sm xl:grid-cols-[minmax(0,1fr)_auto] ' +(cancelled ? 'text-slate-500' : '')}>
            <div className="min-w-0">
              <p className={'font-medium ' + (cancelled ? 'line-through' : '')}>{item.nome}</p>
              <p className="break-all text-xs">{item.codigo_barras}</p>
              <p>{qty(item.quantidade, item.unidade_medida)} {item.unidade_medida} × {reais(item.preco_unitario)} = <strong>{reais(item.subtotal ?? '0.00')}</strong></p>
              <p className="flex flex-wrap items-center gap-1 text-xs"><Badge status={cancelled ? 'CANCELADO' : 'ATIVO'} />
                {item.cancelamento && ' · autorizado por ' + item.cancelamento.supervisor + ' · ' + item.cancelamento.motivo}</p>
            </div>
            {!cancelled && <div className="flex flex-wrap items-start gap-2">
              <button className={buttonClass} disabled={busy} onClick={() => setEditing({ item, value: qty(item.quantidade, item.unidade_medida) })}>Editar quantidade</button>
              <button className={buttonClass} disabled={busy} onClick={() => { cancelItem.reset(); setCancelling(item); }}>Solicitar cancelamento</button>
            </div>}
          </li>;
        })}</ul>}
        {sale && <div className="flex flex-wrap items-end justify-between gap-3 border-t pt-3">
          <div><p className="text-sm text-slate-400">{sale.itens_ativos} item(ns) ativo(s) · {sale.status}</p>
            <p className="text-3xl font-bold" aria-live="polite">{reais(sale.valor_total)}</p></div>
          <div className="flex flex-wrap gap-2">
            <button className={buttonClass} disabled={busy} onClick={() => setConfirmSale(true)}>Cancelar venda</button>
            <button className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white disabled:opacity-50"
              disabled={busy || sale.itens_ativos === 0} onClick={() => { setNotice(undefined); setPaying(true); }}>Ir para pagamento</button>
          </div>
        </div>}
      </div>
    </div>}

    {editing && <dialog ref={node => { if (node && !node.open) node.showModal(); }} onCancel={() => setEditing(undefined)}
      className="fixed inset-0 m-auto w-[min(90vw,24rem)] rounded-xl bg-slate-900 p-5 shadow-xl backdrop:bg-black/70">
      <form className="grid gap-3" onSubmit={event => { event.preventDefault(); const value = normalize(editing.value);
        if (!validQty(value, editing.item.unidade_medida)) { setNotice({ kind: 'error', text: 'Quantidade inválida para a unidade ' + editing.item.unidade_medida + '.' }); return; }
        edit.mutate({ item: editing.item, value }); }}>
        <h2 className="font-semibold">Editar quantidade · {editing.item.nome}</h2>
        <input autoFocus className={inputClass} inputMode="decimal" value={editing.value} onChange={event => setEditing({ ...editing, value: event.target.value })} />
        <div className="flex gap-2"><button type="button" className={buttonClass} onClick={() => setEditing(undefined)}>Voltar</button>
          <button className={buttonClass} disabled={edit.isPending}>Salvar</button></div>
      </form>
    </dialog>}

    {cancelling && <dialog ref={node => { if (node && !node.open) node.showModal(); }} onCancel={event => { event.preventDefault(); if (!cancelItem.isPending) setCancelling(undefined); }}
      className="fixed inset-0 m-auto w-[min(90vw,26rem)] rounded-xl bg-slate-900 p-5 shadow-xl backdrop:bg-black/70">
      <form className="grid gap-3" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget);
        cancelItem.mutate({ item: cancelling, motivo: String(form.get('motivo')), matricula: String(form.get('matricula')), senha: String(form.get('senha')) });
        event.currentTarget.reset(); }}>
        <h2 className="font-semibold">Cancelar item · {cancelling.nome}</h2>
        <label className="grid gap-1 text-sm">Motivo <select name="motivo" required className={inputClass}>
          {['Cliente desistiu', 'Registro em duplicidade', 'Produto avariado', 'Preço divergente'].map(reason => <option key={reason}>{reason}</option>)}
        </select></label>
        <p className="text-sm text-slate-400">Autorização de supervisor (outra pessoa com permissão de cancelar itens):</p>
        <label className="grid gap-1 text-sm">Matrícula do supervisor <input name="matricula" required autoComplete="off" className={inputClass} /></label>
        <label className="grid gap-1 text-sm">Senha do supervisor <input name="senha" type="password" required autoComplete="off" className={inputClass} /></label>
        {cancelItem.isError && <p role="alert" className="text-red-300">{cancelItem.error.message}</p>}
        <div className="flex gap-2"><button type="button" className={buttonClass} disabled={cancelItem.isPending} onClick={() => setCancelling(undefined)}>Voltar</button>
          <button className={buttonClass} disabled={cancelItem.isPending}>{cancelItem.isPending ? 'Autorizando…' : 'Autorizar cancelamento'}</button></div>
      </form>
    </dialog>}

    {confirmSale && sale && <dialog ref={node => { if (node && !node.open) node.showModal(); }} onCancel={() => setConfirmSale(false)}
      className="fixed inset-0 m-auto w-[min(90vw,24rem)] rounded-xl bg-slate-900 p-5 shadow-xl backdrop:bg-black/70">
      <h2 className="font-semibold">Cancelar a venda #{sale.id_venda}?</h2>
      <p className="mt-2 text-sm">Os itens permanecem registrados para auditoria. Esta confirmação não é armazenada como justificativa.</p>
      <div className="mt-3 flex gap-2"><button className={buttonClass} onClick={() => setConfirmSale(false)}>Voltar</button>
        <button className={buttonClass} disabled={cancelSale.isPending} onClick={() => cancelSale.mutate()}>Confirmar cancelamento</button></div>
    </dialog>}
  </section>;
}
