import { useMutation, useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { json, reais } from '../services/admin';
import { request } from '../services/http';
import { buttonClass, inputClass } from './adminFields';

type Item = { id_item_venda: number; nome: string; codigo_barras: string; unidade_medida: string; quantidade: string; preco_unitario: string;
  subtotal: string | null; situacao: 'ATIVO' | 'CANCELADO'; cancelamento: { supervisor: string; motivo: string } | null };
type Form = { id_forma_pagamento: number; descricao: string; permite_troco: boolean };
type Payment = { id_pagamento: number; forma: string; valor: string; valor_recebido: string | null; troco: string | null };
type Summary = { id_venda: number; status: string; valor_total: string; itens_ativos: Item[]; formas: Form[]; total_pago: string; saldo: string };
export type Receipt = { aviso: string; supermercado: string; id_venda: number; status: string; data_hora: string; numero_caixa: number;
  operador: { nome: string; matricula: string } | null; itens: Item[]; valor_total: string; pagamentos: Payment[];
  total_pago: string; total_recebido: string; troco: string };

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await request(path, options);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new HttpError(response.status, body?.error?.message ?? 'Não foi possível concluir a operação.');
  }
  return response.json() as Promise<T>;
}

// O MySQL grava DATETIME em UTC (fuso do container); a exibição converte para o fuso do navegador.
export const localTime = (utc: string) => new Date(utc.replace(' ', 'T') + 'Z').toLocaleString('pt-BR');

// Centavos inteiros (BigInt) também no React, para o rascunho bater com o cálculo do servidor.
const MONEY = /^\d{1,8}(?:[.,]\d{1,2})?$/;
function toCents(value: string) {
  const [whole, fraction = ''] = value.trim().replace(',', '.').split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
const text = (value: bigint) => { const d = (value < 0n ? -value : value).toString().padStart(3, '0'); return (value < 0n ? '-' : '') + d.slice(0, -2) + '.' + d.slice(-2); };
const qty = (value: string, unit: string) => unit === 'UN' ? value.split('.')[0] : value.replace('.', ',');

type Line = { key: number; form: number; valor: string; recebido: string };

export function PdvPayment({ saleId, onDone, onClose }: { saleId: number; onDone: (receipt: Receipt) => void; onClose: () => void }) {
  const summary = useQuery({ queryKey: ['pdv', 'resumo', saleId], queryFn: ({ signal }) => api<Summary>('vendas/' + saleId + '/pagamento/resumo', { signal }) });
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState('');
  // Trava síncrona: um duplo clique dispara dois eventos antes de o React desabilitar o botão.
  const sending = useRef(false);
  const finalize = useMutation({
    mutationFn: (body: object) => api<Receipt>('vendas/' + saleId + '/finalizar', json('POST', body)),
    onSettled: () => { sending.current = false; },
    onSuccess: receipt => onDone(receipt),
    onError: async (failure: Error) => {
      setError(failure.message);
      // Antes de oferecer nova tentativa, consulta o estado real da venda no servidor.
      const current = await summary.refetch();
      if (current.data?.status === 'FINALIZADA') onDone(await api<Receipt>('vendas/' + saleId + '/comprovante'));
    },
  });
  if (summary.isPending) return <p role="status">Carregando resumo do pagamento…</p>;
  if (summary.isError) return <p role="alert">{summary.error.message}</p>;
  const data = summary.data;
  const forms = new Map(data.formas.map(form => [form.id_forma_pagamento, form]));
  const total = toCents(data.valor_total);
  const valid = lines.every(line => MONEY.test(line.valor) && toCents(line.valor) > 0n && (!forms.get(line.form)?.permite_troco || !line.recebido || (MONEY.test(line.recebido) && toCents(line.recebido) >= toCents(line.valor))));
  const applied = lines.reduce((sum, line) => sum + (MONEY.test(line.valor) ? toCents(line.valor) : 0n), 0n);
  const change = lines.reduce((sum, line) => sum + (forms.get(line.form)?.permite_troco && MONEY.test(line.recebido) && MONEY.test(line.valor) ? toCents(line.recebido) - toCents(line.valor) : 0n), 0n);
  const remaining = total - applied;
  const used = new Set(lines.map(line => line.form));
  const ready = lines.length > 0 && valid && remaining === 0n && change >= 0n && data.status === 'ABERTA';

  function add(form: Form) {
    setError('');
    setLines([...lines, { key: Date.now(), form: form.id_forma_pagamento, valor: remaining > 0n ? text(remaining).replace('.', ',') : '', recebido: '' }]);
  }
  const update = (key: number, patch: Partial<Line>) => setLines(lines.map(line => line.key === key ? { ...line, ...patch } : line));
  function confirm() {
    if (!ready || finalize.isPending || sending.current) return;
    sending.current = true;
    setError('');
    finalize.mutate({ pagamentos: lines.map(line => {
      const form = forms.get(line.form)!;
      const valor = text(toCents(line.valor));
      return form.permite_troco && line.recebido ? { id_forma_pagamento: line.form, valor, valor_recebido: text(toCents(line.recebido)) } : { id_forma_pagamento: line.form, valor };
    }) });
  }

  return <section className="space-y-4 rounded-xl border bg-white p-4" aria-label="Pagamento">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold">Pagamento · Venda #{data.id_venda}</h2>
      <button className={buttonClass} disabled={finalize.isPending} onClick={onClose}>Voltar ao carrinho</button>
    </div>
    <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">Demonstração acadêmica: nenhuma cobrança real, cartão ou Pix é processado. Não informe dados de cartão.</p>
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="min-w-0">
        <h3 className="font-medium">Itens ativos</h3>
        <ul className="divide-y text-sm">{data.itens_ativos.map(item => <li key={item.id_item_venda} className="flex justify-between gap-2 py-1">
          <span className="min-w-0">{item.nome} · {qty(item.quantidade, item.unidade_medida)} {item.unidade_medida} × {reais(item.preco_unitario)}</span>
          <strong>{reais(item.subtotal ?? '0.00')}</strong></li>)}</ul>
        <p className="mt-2 text-2xl font-bold">Total {reais(data.valor_total)}</p>
      </div>
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap gap-2">{data.formas.map(form => <button key={form.id_forma_pagamento} className={buttonClass}
          disabled={used.has(form.id_forma_pagamento) || finalize.isPending || remaining <= 0n} onClick={() => add(form)}>+ {form.descricao}</button>)}</div>
        {lines.length === 0 && <p className="text-sm text-slate-600">Adicione uma ou mais formas de pagamento. A composição é apenas um rascunho até a confirmação.</p>}
        {lines.map(line => { const form = forms.get(line.form)!; return <fieldset key={line.key} className="grid min-w-0 gap-2 rounded border p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <legend className="px-1 text-sm font-medium">{form.descricao}{form.permite_troco ? ' (aceita troco)' : ''}</legend>
          <label className="grid gap-1 text-sm">Valor aplicado
            <input className={inputClass + ' w-full min-w-0'} inputMode="decimal" value={line.valor} onChange={event => update(line.key, { valor: event.target.value })} disabled={finalize.isPending} /></label>
          {form.permite_troco ? <label className="grid gap-1 text-sm">Valor recebido
            <input className={inputClass + ' w-full min-w-0'} inputMode="decimal" value={line.recebido} placeholder="igual ao aplicado" onChange={event => update(line.key, { recebido: event.target.value })} disabled={finalize.isPending} /></label>
            : <p className="self-end text-xs text-slate-500">Confirmação demonstrativa, sem troco.</p>}
          <button className={buttonClass + ' self-end'} disabled={finalize.isPending} onClick={() => setLines(lines.filter(other => other.key !== line.key))}>Remover</button>
        </fieldset>; })}
        <dl className="grid grid-cols-3 gap-2 rounded bg-slate-50 p-3 text-sm">
          <div><dt>Aplicado</dt><dd className="font-semibold">{reais(text(applied))}</dd></div>
          <div><dt>Saldo restante</dt><dd className={'font-semibold ' + (remaining === 0n ? 'text-emerald-700' : 'text-red-700')}>{reais(text(remaining))}</dd></div>
          <div><dt>Troco</dt><dd className="font-semibold">{reais(text(change < 0n ? 0n : change))}</dd></div>
        </dl>
        {!valid && <p role="alert" className="text-sm text-red-800">Verifique os valores: positivos, até 2 casas, e recebido ≥ aplicado.</p>}
        {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
        <button className="w-full rounded-lg bg-emerald-700 px-4 py-3 font-semibold text-white disabled:opacity-50" disabled={!ready || finalize.isPending} onClick={confirm}>
          {finalize.isPending ? 'Processando… aguarde' : 'Confirmar pagamento'}</button>
      </div>
    </div>
  </section>;
}

export function ReceiptView({ receipt, onClose }: { receipt: Receipt; onClose: () => void }) {
  return <section className="receipt mx-auto max-w-md space-y-3 rounded-xl border bg-white p-5 font-mono text-sm" aria-label="Comprovante">
    <p className="rounded border-2 border-slate-900 p-2 text-center font-bold">{receipt.aviso}</p>
    <div className="text-center"><p className="font-bold">{receipt.supermercado}</p>
      <p>Venda #{receipt.id_venda} · Terminal {receipt.numero_caixa} · {receipt.status}</p>
      <p>Operador {receipt.operador?.matricula} {receipt.operador?.nome}</p>
      <p>{localTime(receipt.data_hora)}</p></div>
    <table className="w-full"><tbody>{receipt.itens.map(item => <tr key={item.id_item_venda} className={item.situacao === 'CANCELADO' ? 'text-slate-500' : ''}>
      <td className="py-1 pr-2">{item.nome}<br />{qty(item.quantidade, item.unidade_medida)} {item.unidade_medida} × {reais(item.preco_unitario)}
        {item.situacao === 'CANCELADO' && <><br />*** ITEM CANCELADO ({item.cancelamento?.supervisor}) ***</>}</td>
      <td className={'text-right align-top ' + (item.situacao === 'CANCELADO' ? 'line-through' : '')}>{reais(item.subtotal ?? '0.00')}</td></tr>)}</tbody></table>
    <p className="flex justify-between border-t pt-2 text-base font-bold"><span>TOTAL</span><span>{reais(receipt.valor_total)}</span></p>
    {receipt.pagamentos.map(payment => <p key={payment.id_pagamento} className="flex justify-between gap-2"><span>{payment.forma}{payment.valor_recebido && payment.valor_recebido !== payment.valor ? ' (recebido ' + reais(payment.valor_recebido) + ')' : ''}</span><span>{reais(payment.valor)}</span></p>)}
    <p className="flex justify-between"><span>Total pago</span><span>{reais(receipt.total_pago)}</span></p>
    <p className="flex justify-between"><span>Valor recebido</span><span>{reais(receipt.total_recebido)}</span></p>
    <p className="flex justify-between font-bold"><span>Troco</span><span>{reais(receipt.troco)}</span></p>
    <p className="text-center text-xs">Documento não fiscal. Não é NFC-e.</p>
    <div className="no-print flex gap-2"><button className={buttonClass} onClick={() => window.print()}>Imprimir</button>
      <button className={buttonClass} onClick={onClose}>Fechar comprovante</button></div>
  </section>;
}
