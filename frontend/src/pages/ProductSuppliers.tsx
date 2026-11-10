import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { adminRequest, json, optionsFor, reais } from '../services/admin';
import { buttonClass, inputClass } from './adminFields';

type Link = { id_fornecedor: number; razao_social: string; preco_custo: string; prazo_entrega_dias: number | null };

export function ProductSuppliers({ id }: { id: number }) {
  const path = 'produtos/' + id + '/fornecedores';
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Link>();
  const client = useQueryClient();
  const suppliers = useQuery({ queryKey: ['admin', 'fornecedores', 'options'],
    queryFn: ({ signal }) => optionsFor('fornecedores', signal) });
  const links = useQuery({ queryKey: ['admin', path, page],
    queryFn: ({ signal }) => adminRequest<{ items: Link[]; mais: boolean }>(path + '?pagina=' + page, { signal }) });
  const save = useMutation({
    mutationFn: ({ supplier, cost, days }: { supplier: number; cost: string; days: number | null }) =>
      adminRequest(editing ? path + '/' + editing.id_fornecedor : path,
        json(editing ? 'PATCH' : 'POST', { ...(!editing && { id_fornecedor: supplier }), preco_custo: cost, prazo_entrega_dias: days })),
    onSuccess: async () => { setEditing(undefined); await client.invalidateQueries({ queryKey: ['admin', path] }); },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const days = String(form.get('dias') ?? '');
    save.mutate({ supplier: Number(form.get('fornecedor')), cost: String(form.get('custo')).trim().replace(',', '.'),
      days: days === '' ? null : Number(days) });
  }

  return <section className="mt-6 border-t border-slate-800 pt-4">
    <h3 className="font-semibold">Fornecedores do produto</h3>
    {links.isPending && <p role="status">Carregando vínculos…</p>}
    {links.isError && <p role="alert">{links.error.message}</p>}
    {links.data?.items.length === 0 && <p>Nenhum fornecedor associado.</p>}
    <ul className="my-3 grid gap-2">{links.data?.items.map((link) =>
      <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 p-2" key={link.id_fornecedor}>
        <span>{link.razao_social} · {reais(link.preco_custo)} · {link.prazo_entrega_dias === null ? 'Sem prazo' : link.prazo_entrega_dias + ' dias'}</span>
        <button className={buttonClass} disabled={save.isPending} onClick={() => { save.reset(); setEditing(link); }}>Editar vínculo</button>
      </li>)}</ul>
    <div className="mb-3 flex gap-2">
      <button className={buttonClass} disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</button>
      <button className={buttonClass} disabled={!links.data?.mais} onClick={() => setPage(page + 1)}>Próxima</button>
    </div>
    {suppliers.isError && <p role="alert">{suppliers.error.message}</p>}
    <form className="flex flex-wrap items-end gap-3" key={editing?.id_fornecedor ?? (save.isSuccess ? 'saved' : 'new')} onSubmit={submit}>
      {editing ? <p>{editing.razao_social}</p> : <label className="grid gap-1 text-sm">Fornecedor
        <select className={inputClass} name="fornecedor" required defaultValue="">
          <option value="">Selecione</option>{suppliers.data?.map((row) => <option key={row.id} value={row.id}>{row.razao_social}</option>)}
        </select>
      </label>}
      <label className="grid gap-1 text-sm">Preço de custo<input className={inputClass} name="custo" inputMode="decimal" required defaultValue={editing?.preco_custo} /></label>
      <label className="grid gap-1 text-sm">Prazo em dias<input className={inputClass} name="dias" type="number" min={0} max={32767} defaultValue={editing?.prazo_entrega_dias ?? ''} /></label>
      <button className={buttonClass} disabled={save.isPending}>{save.isPending ? 'Salvando…' : editing ? 'Salvar vínculo' : 'Associar fornecedor'}</button>
      {editing && <button type="button" className={buttonClass} disabled={save.isPending} onClick={() => { setEditing(undefined); save.reset(); }}>Cancelar</button>}
    </form>
    {save.isError && <p role="alert" className="text-red-300">{save.error.message}</p>}
    {save.isSuccess && <p role="status" className="text-emerald-400">Vínculo salvo.</p>}
  </section>;
}
