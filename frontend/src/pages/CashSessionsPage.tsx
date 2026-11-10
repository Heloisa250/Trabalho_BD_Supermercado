import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminRequest, json, reais } from '../services/admin';
import type { Employee } from '../services/auth';
import { buttonClass, inputClass } from './adminFields';

type Session = {
  id_sessao: number; id_operador: number; numero: number; operador: string; situacao: 'ABERTA' | 'FECHADA';
  data_abertura: string; data_fechamento: string | null; fundo_troco: string; valor_contado: string | null;
};
type Detail = Session & {
  recebido_dinheiro: string; valor_esperado: string; diferenca: string | null; resultado: string | null;
  vendas_abertas: number; vendas_pendentes: number; divergencias: { id_pagamento: number; aplicado: string; liquido: string | null }[];
};
type Terminal = { id_caixa: number; numero: number; descricao: string | null; disponivel: number };
const endpoint = 'sessoes-caixa';
const queryKey = ['admin',endpoint];
const date = (value: string | null) => value ? value.slice(0,10).split('-').reverse().join('/') + ' ' + value.slice(11) : '—';
function difference(value: string, expected: string) {
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(value)) return null;
  function cents(decimal: string) {
    const [whole, fraction = ''] = decimal.split('.');
    return BigInt(whole) * 100n + (whole.startsWith('-') ? -1n : 1n) * BigInt(fraction.padEnd(2,'0'));
  }
  const diff = cents(value) - cents(expected);
  const digits = (diff < 0n ? -diff : diff).toString().padStart(3,'0');
  return (diff < 0n ? '−' : '') + reais(digits.slice(0,-2) + '.' + digits.slice(-2));
}

export function CashSessionsPage({ employee, admin }: { employee: Employee; admin: boolean }) {
  const [params,setParams] = useSearchParams();
  const [selected,setSelected] = useState<number>();
  const [action,setAction] = useState<'open' | 'close'>();
  const [counted,setCounted] = useState('');
  const [notice,setNotice] = useState('');
  const client = useQueryClient();
  const list = useQuery({ queryKey:[...queryKey,'list',params.toString()], queryFn:({signal}) =>
    adminRequest<{ items:Session[]; pagina:number; mais:boolean }>(endpoint + '?' + params,{signal}) });
  const active = useQuery({ queryKey:[...queryKey,'active'], queryFn:({signal}) => adminRequest<Detail | null>(endpoint+'/ativa',{signal}) });
  const terminals = useQuery({ queryKey:[...queryKey,'terminals'], queryFn:({signal}) => adminRequest<Terminal[]>(endpoint+'/terminais',{signal}) });
  const detail = useQuery({ queryKey:[...queryKey,'detail',selected], enabled:selected !== undefined,
    queryFn:({signal}) => adminRequest<Detail>(endpoint+'/'+selected,{signal}) });
  const save = useMutation({
    mutationFn: ({path,body}: {path:string;body:object}) => adminRequest<Detail>(endpoint+path,json('POST',body)),
    onSuccess: async (session) => {
      setNotice(session.situacao === 'ABERTA' ? 'Caixa aberto.' : 'Caixa fechado.');
      setSelected(session.id_sessao);
      setAction(undefined);
      await client.invalidateQueries({queryKey});
    },
  });
  function start(next: 'open' | 'close') {
    save.reset();
    setCounted('');
    setAction(next);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amount = String(form.get('valor') ?? '').trim().replace(',','.');
    if (action === 'open') save.mutate({path:'/abrir',body:{ id_caixa:Number(form.get('terminal')), fundo_troco:amount }});
    if (action === 'close' && detail.data) save.mutate({path:'/'+detail.data.id_sessao+'/fechar',body:{ valor_contado:amount }});
  }
  function page(pagina: number) {
    const next = new URLSearchParams(params);
    next.set('pagina',String(pagina));
    setParams(next);
  }
  const current = detail.data;
  const blocked = current && (current.vendas_abertas > 0 || current.vendas_pendentes > 0 || current.divergencias.length > 0);
  return <section className="min-w-0 space-y-4 p-4 sm:p-8">
    <h1 className="text-2xl font-bold">Sessões de Caixa</h1>
    <button className={buttonClass} disabled={!active.isSuccess || !!active.data || !terminals.data?.some(t=>t.disponivel)} onClick={()=>start('open')}>Abrir caixa</button>
    {notice && <p role="status">{notice}</p>}
    {active.data && <section className="rounded border bg-white p-3">
      <h2 className="font-semibold">Sessão ativa #{active.data.id_sessao}</h2>
      <p>Terminal {active.data.numero} · {active.data.operador} · {date(active.data.data_abertura)} · {reais(active.data.fundo_troco)} · ABERTA</p>
      <button className={buttonClass} onClick={()=>setSelected(active.data!.id_sessao)}>Conferir sessão ativa</button>
    </section>}
    <form key={params.toString()} className="flex flex-wrap items-end gap-2" onSubmit={event=>{
      event.preventDefault();
      const next = new URLSearchParams();
      for (const [key,value] of new FormData(event.currentTarget)) if (value) next.set(key,String(value));
      setParams(next);
    }}>
      <label>Número da sessão <input name="numero" type="number" min={1} className={inputClass} defaultValue={params.get('numero') ?? ''}/></label>
      <label>Terminal <select name="caixa" className={inputClass} defaultValue={params.get('caixa') ?? ''}>
        <option value="">Todos</option>{terminals.data?.map(t=><option key={t.id_caixa} value={t.id_caixa}>{t.numero}</option>)}
      </select></label>
      {admin && <label>ID do operador <input name="operador" type="number" min={1} className={inputClass} defaultValue={params.get('operador') ?? ''}/></label>}
      <label>Situação <select name="situacao" className={inputClass} defaultValue={params.get('situacao') ?? ''}>
        <option value="">Todas</option><option>ABERTA</option><option>FECHADA</option>
      </select></label>
      <label>De <input name="inicio" type="date" className={inputClass} defaultValue={params.get('inicio') ?? ''}/></label>
      <label>Até <input name="fim" type="date" className={inputClass} defaultValue={params.get('fim') ?? ''}/></label>
      <button className={buttonClass}>Filtrar</button>
    </form>
    {(list.isPending || active.isPending) && <p role="status">Carregando sessões…</p>}
    {(list.isError || active.isError || terminals.isError || detail.isError) && <p role="alert">{list.error?.message ?? active.error?.message ?? terminals.error?.message ?? detail.error?.message}</p>}
    {list.data?.items.length === 0 && <p>Nenhuma sessão encontrada.</p>}
    {!!list.data?.items.length && <div className="overflow-x-auto rounded border bg-white"><table className="w-full text-left text-sm">
      <thead><tr>{['Sessão','Terminal','Operador','Abertura','Fechamento','Fundo','Contado','Situação','Ações'].map(label=><th key={label} className="p-2">{label}</th>)}</tr></thead>
      <tbody>{list.data.items.map(row=><tr key={row.id_sessao} className="border-t">
        {[row.id_sessao,row.numero,row.operador,date(row.data_abertura),date(row.data_fechamento),reais(row.fundo_troco),
          row.valor_contado === null ? '—' : reais(row.valor_contado),row.situacao].map((value,index)=><td key={index} className="p-2">{value}</td>)}
        <td className="p-2"><button className={buttonClass} onClick={()=>setSelected(row.id_sessao)}>Detalhes</button></td>
      </tr>)}</tbody>
    </table></div>}
    {list.data && <nav aria-label="Paginação" className="flex gap-2">
      <button className={buttonClass} disabled={list.data.pagina===1} onClick={()=>page(list.data!.pagina-1)}>Anterior</button>
      <span>Página {list.data.pagina}</span><button className={buttonClass} disabled={!list.data.mais} onClick={()=>page(list.data!.pagina+1)}>Próxima</button>
    </nav>}
    {selected !== undefined && detail.isPending && <p role="status">Carregando conferência…</p>}
    {current && <section className="space-y-2 rounded border bg-white p-3">
      <h2 className="font-semibold">Sessão #{current.id_sessao} · {current.situacao}</h2>
      <p>Terminal {current.numero} · {current.operador} · {date(current.data_abertura)}</p>
      <p>Fundo {reais(current.fundo_troco)} · Dinheiro {reais(current.recebido_dinheiro)} · Esperado {reais(current.valor_esperado)}</p>
      {current.valor_contado !== null && <p>Contado {reais(current.valor_contado)} · Diferença {reais(current.diferenca!)} · {current.resultado}</p>}
      {current.vendas_abertas > 0 && <p>{current.vendas_abertas} venda(s) aberta(s).</p>}
      {current.vendas_pendentes > 0 && <p>{current.vendas_pendentes} venda(s) com pagamento pendente ou divergente.</p>}
      {current.divergencias.map(d=><p key={d.id_pagamento}>Pagamento #{d.id_pagamento} · Aplicado {reais(d.aplicado)} · Líquido {d.liquido === null ? '—' : reais(d.liquido)}</p>)}
      {current.situacao === 'ABERTA' && current.id_operador === employee.id && <button className={buttonClass} disabled={!!blocked} onClick={()=>start('close')}>Fechar caixa</button>}
    </section>}
    {action && <dialog ref={node=>{if(node && !node.open) node.showModal();}} onCancel={event=>{
      event.preventDefault();
      if (!save.isPending) setAction(undefined);
    }} className="fixed inset-0 m-auto w-[min(90vw,32rem)] rounded-xl bg-white p-5 shadow-xl backdrop:bg-black/40">
      <form className="grid gap-3" onSubmit={submit}>
        <h2 className="font-semibold">{action === 'open' ? 'Abrir caixa' : 'Fechar caixa'}</h2>
        <p>Operador {employee.nome}</p>
        {action === 'open' ? <label>Terminal <select required name="terminal" className={inputClass}><option value="">Selecione</option>
          {terminals.data?.filter(t=>t.disponivel).map(t=><option key={t.id_caixa} value={t.id_caixa}>{t.numero} {t.descricao}</option>)}
        </select></label> : current && <p>Fundo {reais(current.fundo_troco)} · Dinheiro {reais(current.recebido_dinheiro)} · Esperado {reais(current.valor_esperado)}</p>}
        <label>{action === 'open' ? 'Fundo de troco' : 'Valor contado'} <input required name="valor" inputMode="decimal" pattern="[0-9]{1,8}([.,][0-9]{1,2})?"
          className={inputClass} value={counted} onChange={event=>setCounted(event.target.value)}/></label>
        {action === 'close' && current && <p>Diferença estimada {difference(counted.trim().replace(',','.'),current.valor_esperado) ?? '—'}</p>}
        {save.isError && <p role="alert">{save.error.message}</p>}
        <div className="flex gap-2"><button type="button" disabled={save.isPending} className={buttonClass} onClick={()=>setAction(undefined)}>Voltar</button>
          <button className={buttonClass} disabled={save.isPending}>Confirmar</button></div>
      </form>
    </dialog>}
  </section>;
}
