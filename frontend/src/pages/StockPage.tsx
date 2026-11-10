import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { adminRequest, json, optionsFor, reais, type Page, type Row } from '../services/admin';
import { buttonClass, inputClass } from './adminFields';

const sections = {
  estoque: { title: 'Estoque', path: 'estoque', columns: ['nome','codigo_barras','categoria','unidade_medida','fisico','estoque_minimo','estoque_maximo','faixa','vencido','disponivel','proximo','lotes'] },
  lotes: { title: 'Lotes', path: 'lotes', columns: ['produto','codigo_lote','quantidade_inicial','quantidade_atual','data_fabricacao','data_validade','data_entrada','custo_unitario','id_pedido'] },
  movimentos: { title: 'Movimentações de estoque', path: 'estoque/movimentacoes', columns: ['data_hora','produto','codigo_lote','tipo','quantidade','funcionario','observacao'] },
} as const;
const labels: Record<string, string> = {
  nome: 'Produto', produto: 'Produto', codigo_barras: 'Código de barras', categoria: 'Categoria', unidade_medida: 'Unidade',
  fisico: 'Saldo físico', estoque_minimo: 'Mínimo', estoque_maximo: 'Máximo', faixa: 'Faixa', vencido: 'Vencido',
  disponivel: 'Potencialmente disponível', proximo: 'Próximo do vencimento', lotes: 'Lotes', codigo_lote: 'Lote',
  quantidade_inicial: 'Quantidade inicial', quantidade_atual: 'Saldo atual', data_fabricacao: 'Fabricação',
  data_validade: 'Validade', data_entrada: 'Entrada', custo_unitario: 'Custo', id_pedido: 'Pedido',
  data_hora: 'Data e hora', tipo: 'Tipo', quantidade: 'Quantidade', funcionario: 'Funcionário', observacao: 'Observação',
};
const decimalFields = ['fisico','estoque_minimo','estoque_maximo','vencido','disponivel','proximo','quantidade_inicial','quantidade_atual','quantidade'];
function display(key: string, value: Row[string]) {
  if (value == null) return '—';
  if (key === 'custo_unitario') return reais(String(value));
  if (decimalFields.includes(key)) return String(value).replace('.', ',');
  if (key.startsWith('data_')) return String(value).slice(0, 10).split('-').reverse().join('/') + String(value).slice(10);
  if (key === 'faixa') return { baixo: 'Abaixo do mínimo', normal: 'Dentro da faixa', alto: 'Acima do máximo' }[String(value)];
  return String(value);
}

export function StockPage({ section }: { section: keyof typeof sections }) {
  const config = sections[section];
  const [params, setParams] = useSearchParams();
  const [action, setAction] = useState<{ path: string; title: string; lot?: Row }>();
  const [notice, setNotice] = useState('');
  const client = useQueryClient();
  const data = useQuery({ queryKey: ['admin','stock',config.path,params.toString()],
    queryFn: ({ signal }) => adminRequest<Page>(config.path + '?' + params, { signal }) });
  const products = useQuery({ queryKey: ['admin','produtos','options'], queryFn: ({ signal }) => optionsFor('produtos', signal) });
  const save = useMutation({
    mutationFn: ({ path, body }: { path: string; body: object }) => adminRequest(path, json('POST', body)),
    onSuccess: async () => {
      setAction(undefined);
      setNotice('Movimentação registrada.');
      await client.invalidateQueries({ queryKey: ['admin','stock'] });
    },
  });
  function open(path: string, title: string, lot?: Row) {
    save.reset();
    setNotice('');
    setAction({ path, title, lot });
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action) return;
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? '').trim();
    const number = (key: string) => value(key).replace(',', '.');
    const body = action.lot
      ? { motivo: value('motivo'), ...(action.path.endsWith('/perdas') ? { quantidade: number('quantidade') } : { saldo: number('saldo') }) }
      : { id_produto: Number(value('produto')), codigo_lote: value('codigo_lote'), quantidade: number('quantidade'),
        custo_unitario: number('custo_unitario'), data_fabricacao: value('data_fabricacao') || null, data_validade: value('data_validade') || null };
    save.mutate({ path: action.path, body });
  }
  function page(pagina: number) {
    const next = new URLSearchParams(params);
    next.set('pagina', String(pagina));
    setParams(next);
  }
  return <section className="min-w-0 space-y-4 p-4 sm:p-8">
    <h1 className="text-2xl font-bold">{config.title}</h1>
    {section === 'lotes' && <button className={buttonClass} onClick={() => open('estoque/entradas','Entrada independente')}>Registrar entrada</button>}
    {notice && <p role="status">{notice}</p>}
    <form key={params.toString()} className="flex flex-wrap items-end gap-3" onSubmit={event => {
      event.preventDefault();
      const next = new URLSearchParams();
      for (const [key, value] of new FormData(event.currentTarget)) if (value) next.set(key, String(value));
      setParams(next);
    }}>
      <label>Busca <input name="busca" className={inputClass} defaultValue={params.get('busca') ?? ''} /></label>
      <label>Produto <select name="produto" className={inputClass} defaultValue={params.get('produto') ?? ''}>
        <option value="">Todos</option>{products.data?.map(product => <option key={product.id} value={product.id}>{product.nome}</option>)}
      </select></label>
      {section === 'estoque' && <label>Faixa <select name="faixa" className={inputClass} defaultValue={params.get('faixa') ?? ''}>
        <option value="">Todas</option><option value="baixo">Abaixo do mínimo</option><option value="normal">Dentro da faixa</option><option value="alto">Acima do máximo</option>
      </select></label>}
      {section === 'lotes' && <label>Validade <select name="validade" className={inputClass} defaultValue={params.get('validade') ?? ''}>
        <option value="">Todas</option><option value="vencido">Vencido</option><option value="proximo">Próximo do vencimento</option><option value="sem">Sem validade</option>
      </select></label>}
      {section === 'movimentos' && <label>Tipo <select name="tipo" className={inputClass} defaultValue={params.get('tipo') ?? ''}>
        <option value="">Todos</option>{['ENTRADA','PERDA','AJUSTE','SAIDA_VENDA'].map(type => <option key={type}>{type}</option>)}
      </select></label>}
      {section !== 'movimentos' && <label>Horizonte em dias <input type="number" name="dias" min={0} max={365} className={inputClass} defaultValue={params.get('dias') ?? 30} /></label>}
      <button className={buttonClass}>Filtrar</button>
    </form>
    {data.isPending && <p role="status">Carregando…</p>}
    {(data.isError || products.isError) && <p role="alert">{data.error?.message ?? products.error?.message}</p>}
    {data.data?.items.length === 0 && <p>Nenhum registro encontrado.</p>}
    {!!data.data?.items.length && <div className="overflow-x-auto rounded border bg-white"><table className="w-full text-left text-sm">
      <thead><tr>{config.columns.map(key => <th key={key} className="p-2">{labels[key]}</th>)}{section === 'lotes' && <th>Ações</th>}</tr></thead>
      <tbody>{data.data.items.map(record => <tr key={String(record.id_movimentacao ?? record.id_lote ?? record.id_produto)} className="border-t">
        {config.columns.map(key => <td className="p-2" key={key}>{key === 'lotes'
          ? <Link className="underline" to={'/admin/lotes?produto=' + record.id_produto}>{record.lotes}</Link> : display(key, record[key])}</td>)}
        {section === 'lotes' && <td className="p-2"><button className={buttonClass} onClick={() => open('lotes/' + record.id_lote + '/perdas','Registrar perda', record)}>Perda</button>
          <button className={buttonClass} onClick={() => open('lotes/' + record.id_lote + '/ajustes','Ajustar inventário', record)}>Ajustar</button></td>}
      </tr>)}</tbody>
    </table></div>}
    {data.data && <nav className="flex items-center gap-2" aria-label="Paginação">
      <button className={buttonClass} disabled={data.data.pagina === 1} onClick={() => page(data.data!.pagina - 1)}>Anterior</button>
      <span>Página {data.data.pagina}</span><button className={buttonClass} disabled={!data.data.mais} onClick={() => page(data.data!.pagina + 1)}>Próxima</button>
    </nav>}
    {action && <dialog ref={node => { if (node && !node.open) node.showModal(); }} onCancel={event => {
      event.preventDefault();
      if (!save.isPending) setAction(undefined);
    }} className="fixed inset-0 m-auto w-[min(90vw,32rem)] rounded-xl bg-white p-6 shadow-xl backdrop:bg-black/40">
      <form onSubmit={submit} className="grid gap-3">
        <h2 className="text-lg font-semibold">{action.title}</h2>
        {action.lot ? <>
          <p>Lote {action.lot.codigo_lote} · Saldo {display('quantidade_atual', action.lot.quantidade_atual)}</p>
          <label>Motivo <input name="motivo" required maxLength={255} className={inputClass} /></label>
        </> : <>
          <label>Produto <select name="produto" required className={inputClass}><option value="">Selecione</option>
            {products.data?.map(product => <option key={product.id} value={product.id}>{product.nome}</option>)}
          </select></label>
          <label>Código do lote <input name="codigo_lote" required maxLength={30} className={inputClass} /></label>
          <label>Fabricação <input name="data_fabricacao" type="date" className={inputClass} /></label>
          <label>Validade <input name="data_validade" type="date" className={inputClass} /></label>
          <label>Custo unitário <input name="custo_unitario" inputMode="decimal" required className={inputClass} /></label>
        </>}
        {action.path.endsWith('/ajustes') ? <label>Saldo contado <input name="saldo" inputMode="decimal" required className={inputClass} /></label>
          : <label>Quantidade <input name="quantidade" inputMode="decimal" required className={inputClass} /></label>}
        {save.isError && <p role="alert">{save.error.message}</p>}
        <div className="flex gap-2">
          <button className={buttonClass} type="button" disabled={save.isPending} onClick={() => setAction(undefined)}>Voltar</button>
          <button className={buttonClass} disabled={save.isPending}>{save.isPending ? 'Registrando…' : 'Confirmar'}</button>
        </div>
      </form>
    </dialog>}
  </section>;
}
