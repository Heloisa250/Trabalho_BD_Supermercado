import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { adminRequest, json } from '../services/admin';
import { buttonClass, inputClass } from './adminFields';

type Item = { id_produto: number; nome: string; quantidade: string; unidade_medida: string };
type Draft = { id: number; id_produto: number; codigo_lote: string; quantidade: string };
type ReceiptLot = Omit<Draft, 'id'> & { data_fabricacao: string | null; data_validade: string | null };
function draft(id: number, product: number, quantity = ''): Draft {
  return { id, id_produto: product, codigo_lote: '', quantidade: quantity };
}
function milli(value: string) {
  const [whole, fraction = ''] = value.replace(',', '.').split('.');
  return /^\d{1,7}(?:[.,]\d{1,3})?$/.test(value) ? Number(whole) * 1000 + Number(fraction.padEnd(3, '0')) : 0;
}

export function ReceiveOrder({ order, items, close, received }: { order: number; items: Item[]; close: () => void; received: () => void }) {
  const [lots, setLots] = useState(() => items.map(item => draft(item.id_produto, item.id_produto, item.quantidade)));
  const client = useQueryClient();
  const [dateError, setDateError] = useState('');
  const save = useMutation({
    mutationFn: (lotes: ReceiptLot[]) => adminRequest('pedidos-compra/' + order + '/receber', json('POST', { lotes })),
    onSuccess: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: ['admin','pedidos-compra'] }),
        client.invalidateQueries({ queryKey: ['admin','stock'] })]);
      received();
    },
  });
  const total = (product: number) => lots.reduce((sum, lot) => sum + (lot.id_produto === product ? milli(lot.quantidade) : 0), 0);
  const valid = items.length > 0 && lots.every(lot => lot.codigo_lote.trim() && milli(lot.quantidade) > 0) &&
    items.every(item => total(item.id_produto) === milli(item.quantidade));
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || save.isPending) return;
    const form = new FormData(event.currentTarget);
    const lotes = lots.map(({ id, id_produto, codigo_lote, quantidade }) => ({
      id_produto, codigo_lote, quantidade: quantidade.replace(',', '.'),
      data_fabricacao: String(form.get('fabricacao-' + id) ?? '') || null,
      data_validade: String(form.get('validade-' + id) ?? '') || null,
    }));
    if (lotes.some(lot => lot.data_fabricacao && lot.data_validade && lot.data_fabricacao > lot.data_validade)) {
      setDateError('A fabricação não pode ser posterior à validade.');
      return;
    }
    setDateError('');
    save.mutate(lotes);
  }
  return <dialog ref={node => { if (node && !node.open) node.showModal(); }} onCancel={event => {
    event.preventDefault();
    if (!save.isPending) close();
  }} className="fixed inset-0 m-auto max-h-[90vh] w-[min(94vw,48rem)] overflow-auto rounded-xl bg-slate-900 p-5 shadow-xl backdrop:bg-black/70">
    <form className="grid gap-4" onSubmit={submit} onInput={() => setDateError('')}>
      <h2 className="text-lg font-bold">Receber mercadorias · Pedido #{order}</h2>
      <p>Informe os lotes até completar a quantidade de cada item.</p>
      {items.map(item => {
        const productLots = lots.filter(lot => lot.id_produto === item.id_produto);
        return <fieldset key={item.id_produto} className="grid gap-2 rounded border p-3">
          <legend>{item.nome} · {(total(item.id_produto) / 1000).toLocaleString('pt-BR')} de {item.quantidade.replace('.', ',')} {item.unidade_medida}</legend>
          {productLots.map(lot => <div key={lot.id} className="grid gap-2 sm:grid-cols-2">
            {([['codigo_lote','Código do lote'],['quantidade','Quantidade']] as const).map(([key,label]) =>
              <label key={key} className="grid gap-1">{label}<input className={inputClass} value={lot[key]}
                required maxLength={key === 'codigo_lote' ? 30 : undefined}
                inputMode={key === 'quantidade' ? 'decimal' : undefined}
                onChange={event => setLots(current => current.map(row => row.id === lot.id ? { ...row, [key]: event.target.value } : row))} /></label>)}
            <label className="grid gap-1">Fabricação<input className={inputClass} type="date" name={'fabricacao-' + lot.id} /></label>
            <label className="grid gap-1">Validade<input className={inputClass} type="date" name={'validade-' + lot.id} /></label>
            {productLots.length > 1 && <button className={buttonClass} type="button" onClick={() => setLots(current => current.filter(row => row.id !== lot.id))}>Remover lote do formulário</button>}
          </div>)}
          <button className={buttonClass} type="button"
            onClick={() => setLots(current => [...current, draft(Math.max(...current.map(lot => lot.id)) + 1, item.id_produto)])}>Adicionar lote</button>
        </fieldset>;
      })}
      {!valid && <p>Confira os códigos, as datas e os totais dos lotes antes de confirmar.</p>}
      {dateError && <p role="alert">{dateError}</p>}
      {save.isError && <p role="alert">{save.error.message}</p>}
      <div className="flex gap-2">
        <button type="button" className={buttonClass} onClick={close} disabled={save.isPending}>Voltar</button>
        <button className={buttonClass} disabled={!valid || save.isPending}>{save.isPending ? 'Registrando…' : 'Confirmar recebimento'}</button>
      </div>
    </form>
  </dialog>;
}
