import { Badge } from '../components/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { adminRequest, json, optionsFor, reais, type Page, type Row } from '../services/admin';
import { ProductSuppliers } from './ProductSuppliers';
import { modules, labels, inputClass, buttonClass, type Field, type Module } from './adminFields';

function valueOf(form: FormData, field: Field) {
  const value = String(form.get(field.key) ?? '').trim();
  if (field.type === 'checkbox') return form.has(field.key);
  if (field.type === 'password') return String(form.get(field.key) ?? '');
  if (['number', 'cargo', 'categorias', 'marcas'].includes(field.type ?? '')) return value ? Number(value) : null;
  if (field.type === 'decimal') return value.replace(',', '.');
  return value || null;
}

function display(key: string, value: Row[string]) {
  if (key === 'preco_venda' && typeof value === 'string') return reais(value);
  if (key === 'ativo') return <Badge status={value ? 'ATIVO' : 'INATIVO'} />;
  if (key === 'permite_troco' || key === 'pode_cancelar_item') return value ? 'Sim' : 'Não';
  return value ?? '—';
}

export function AdminPage({ module }: { module: Module }) {
  const [params, setParams] = useSearchParams();
  const [editor, setEditor] = useState<{ mode: 'create' | 'edit' | 'detail'; id?: number }>();
  const [confirm, setConfirm] = useState<Row>();
  const [notice, setNotice] = useState('');
  const client = useQueryClient();
  const config = modules[module];
  const query = useQuery({
    queryKey: ['admin', module, params.toString()],
    queryFn: ({ signal }) => adminRequest<Page>(module + '?' + params.toString(), { signal }),
  });
  const selected = useQuery({
    queryKey: ['admin', module, 'detail', editor?.id],
    queryFn: ({ signal }) => adminRequest<Row>(module + '/' + editor?.id, { signal }),
    enabled: editor?.id !== undefined,
  });
  const cargos = useQuery({
    queryKey: ['admin', 'cargos', 'options'],
    enabled: module === 'funcionarios',
    queryFn: async ({ signal }) => {
      const items: Row[] = [];
      for (let pagina = 1; ; pagina++) {
        const result = await adminRequest<Page>('cargos?limite=100&pagina=' + pagina, { signal });
        items.push(...result.items);
        if (!result.mais) return items;
      }
    },
  });
  const categories = useQuery({ queryKey: ['admin', 'categorias', 'options'],
    enabled: module === 'categorias' || module === 'produtos', queryFn: ({ signal }) => optionsFor('categorias', signal) });
  const brands = useQuery({ queryKey: ['admin', 'marcas', 'options'],
    enabled: module === 'produtos', queryFn: ({ signal }) => optionsFor('marcas', signal) });
  const optionQueries = { cargo: cargos, categorias: categories, marcas: brands };
  const searchable = ['funcionarios', 'categorias', 'marcas', 'produtos', 'fornecedores'].includes(module);
  const hasStatus = config.columns.includes('ativo');
  const fields: Field[] = config.fields.filter((field) => !['senha', 'ativo'].includes(field.key) || editor?.mode === 'create');
  const requiredOptions = fields.flatMap(({ type }: Field) =>
    type === 'cargo' || type === 'categorias' || type === 'marcas' ? [optionQueries[type]] : []);
  const optionError = requiredOptions.find((query) => query.isError)?.error;

  function categoryPath(row: Row) {
    const names = [String(row.nome)];
    const seen = new Set([row.id]);
    let parentId = row.id_categoria_pai;
    while (typeof parentId === 'number' && !seen.has(parentId)) {
      const parent = categories.data?.find((item) => item.id === parentId);
      if (!parent) break;
      names.unshift(String(parent.nome));
      seen.add(parentId);
      parentId = parent.id_categoria_pai;
    }
    return names.join(' › ');
  }

  const save = useMutation({
    gcTime: 0,
    mutationFn: ({ path, method, body }: { path: string; method: 'POST' | 'PATCH'; body: object }) =>
      adminRequest(path, json(method, body)),
    onSuccess: async () => {
      setEditor(undefined);
      setConfirm(undefined);
      setNotice('Alteração salva.');
      await client.invalidateQueries({ queryKey: ['admin'] });
    },
  });

  function filters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const [key, value] of values) if (value) next.set(key, String(value));
    setParams(next);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(fields.map((f) => [f.key, valueOf(form, f)]));
    if (editor.mode === 'edit' && selected.data) {
      for (const field of fields) {
        const original = selected.data[field.key];
        if (body[field.key] === (field.type === 'checkbox' ? Boolean(original) : original)) delete body[field.key];
      }
      if (!Object.keys(body).length) { setEditor(undefined); return; }
    }
    setNotice('');
    save.mutate({ path: editor.id ? module + '/' + editor.id : module, method: editor.id ? 'PATCH' : 'POST', body });
  }

  function open(next: typeof editor) {
    save.reset();
    setNotice('');
    setEditor(next);
  }

  const page = query.data?.pagina ?? Number(params.get('pagina') ?? 1);
  function goTo(pagina: number) {
    const next = new URLSearchParams(params);
    next.set('pagina', String(pagina));
    setParams(next);
  }

  return (
    <section className="min-w-0 p-4 sm:p-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{config.title}</h1>
        <button className="rounded-lg bg-emerald-800 px-4 py-2 text-white" onClick={() => open({ mode: 'create' })}>Cadastrar</button>
      </div>
      {searchable && (
        <form key={params.toString()} onSubmit={filters} className="mb-4 flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm">{module === 'funcionarios' ? 'Nome ou matrícula' : module === 'produtos' ? 'Nome ou código de barras' : module === 'fornecedores' ? 'Razão social, fantasia ou CNPJ' : 'Nome'}<input className={inputClass} name="busca" defaultValue={params.get('busca') ?? ''} /></label>
          {module === 'funcionarios' && <label className="grid gap-1 text-sm">Cargo<select className={inputClass} name="cargo" defaultValue={params.get('cargo') ?? ''}>
            <option value="">Todos</option>{cargos.data?.map((row) => <option key={row.id} value={row.id}>{row.nome}</option>)}
          </select></label>}
          {module === 'marcas' && <label className="grid gap-1 text-sm">Fabricante<input className={inputClass} name="fabricante" defaultValue={params.get('fabricante') ?? ''} /></label>}
          {module === 'produtos' && <>
            {([['categoria', 'Categoria', categories.data], ['marca', 'Marca', brands.data]] as const).map(([key, label, rows]) =>
              <label key={key} className="grid gap-1 text-sm">{label}<select className={inputClass} name={key} defaultValue={params.get(key) ?? ''}>
                <option value="">Todas</option>{rows?.map((row) => <option key={row.id} value={row.id}>{key === 'categoria' ? categoryPath(row) : row.nome}</option>)}
              </select></label>)}
            <label className="grid gap-1 text-sm">Ordenar<select className={inputClass} name="ordem" defaultValue={params.get('ordem') ?? 'id'}>
              <option value="id">Cadastro</option><option value="nome">Nome</option><option value="codigo_barras">Código de barras</option><option value="preco_venda">Preço</option>
            </select></label>
            <label className="grid gap-1 text-sm">Ordem<select className={inputClass} name="direcao" defaultValue={params.get('direcao') ?? 'asc'}>
              <option value="asc">Crescente</option><option value="desc">Decrescente</option>
            </select></label>
            {params.has('fornecedor') && <><input type="hidden" name="fornecedor" value={params.get('fornecedor') ?? ''} />
              <Link className={buttonClass} to="/admin/produtos">Limpar filtro de fornecedor</Link></>}
          </>}
          {hasStatus && <label className="grid gap-1 text-sm">Situação<select className={inputClass} name="ativo" defaultValue={params.get('ativo') ?? ''}>
            <option value="">Todas</option><option value="true">Ativo</option><option value="false">Inativo</option>
          </select></label>}
          <button className={buttonClass}>Filtrar</button>
        </form>
      )}
      {notice && <p role="status" className="mb-3 text-emerald-400">{notice}</p>}
      {query.isPending && <p role="status">Carregando…</p>}
      {query.isError && <p role="alert" className="text-red-300">{query.error.message}</p>}
      {query.data?.items.length === 0 && <p>Nenhum registro encontrado.</p>}
      {query.data && query.data.items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-800"><tr>{config.columns.map((key) => <th className="p-3" key={key}>{labels[key]}</th>)}<th className="p-3">Ações</th></tr></thead>
            <tbody>{query.data.items.map((row) => (
              <tr key={row.id} className="border-t border-slate-800">
                {config.columns.map((key) => <td className="p-3" key={key}>{module === 'categorias' && key === 'nome' ? categoryPath(row) : display(key, row[key])}</td>)}
                <td className="p-3"><div className="flex flex-wrap gap-2">
                  <button className={buttonClass} onClick={() => open({ mode: 'detail', id: row.id })}>Detalhes</button>
                  <button className={buttonClass} onClick={() => open({ mode: 'edit', id: row.id })}>Editar</button>
                  {module === 'cargos' ? <Link className={buttonClass} to={'/admin/funcionarios?cargo=' + row.id}>Funcionários</Link>
                    : hasStatus && <button className={buttonClass} onClick={() => { save.reset(); setNotice(''); setConfirm(row); }}>{row.ativo ? 'Desativar' : 'Ativar'}</button>}
                  {(module === 'categorias' || module === 'marcas' || module === 'fornecedores') && <Link className={buttonClass}
                    to={'/admin/produtos?' + { categorias: 'categoria', marcas: 'marca', fornecedores: 'fornecedor' }[module] + '=' + row.id}>Produtos</Link>}
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {query.data && <nav aria-label="Paginação" className="mt-4 flex items-center gap-3">
        <button className={buttonClass} disabled={page <= 1} onClick={() => goTo(page - 1)}>Anterior</button>
        <span>Página {page}</span>
        <button className={buttonClass} disabled={!query.data.mais} onClick={() => goTo(page + 1)}>Próxima</button>
      </nav>}
      {editor && (
        <section className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="mb-3 flex justify-between"><h2 className="font-semibold">{editor.mode === 'detail' ? 'Detalhes' : editor.mode === 'create' ? 'Cadastro' : 'Edição'}</h2>
            <button className={buttonClass} disabled={save.isPending} onClick={() => setEditor(undefined)}>Fechar</button></div>
          {editor.id && selected.isPending && <p role="status">Carregando registro…</p>}
          {editor.mode !== 'detail' && requiredOptions.some((query) => query.isPending) && <p role="status">Carregando opções…</p>}
          {optionError && <p role="alert">{optionError.message}</p>}
          {editor.id && selected.isError && <p role="alert">{selected.error.message}</p>}
          {editor.mode === 'detail' && selected.data && <dl className="grid gap-2 sm:grid-cols-2">
            {Object.entries(selected.data).map(([key, value]) => <div key={key}><dt className="font-medium">{labels[key] ?? config.fields.find((field) => field.key === key)?.label ?? key}</dt><dd>{display(key, value)}</dd></div>)}
          </dl>}
          {module === 'produtos' && editor.mode === 'detail' && selected.data && <ProductSuppliers key={selected.data.id} id={selected.data.id} />}
          {editor.mode !== 'detail' && (!editor.id || selected.data) && requiredOptions.every((query) => query.isSuccess) && (
            <form key={editor.id ?? 'new'} className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
              <p className="text-xs text-slate-400 sm:col-span-2">Campos com <span className="text-red-400">*</span> são obrigatórios.</p>
              {fields.map((field: Field) => {
                const value = selected.data?.[field.key];
                return <label key={field.key} className="grid gap-1 text-sm"><span className="font-medium text-slate-300">{field.label}
                  {field.required && <span className="text-red-400" aria-hidden="true"> *</span>}</span>
                  {field.type === 'cargo' || field.type === 'categorias' || field.type === 'marcas' ?
                    <select className={inputClass} name={field.key} required={field.required} defaultValue={String(value ?? '')}>
                      <option value="">{field.required ? 'Selecione' : 'Nenhuma'}</option>
                      {optionQueries[field.type].data?.filter((row) => field.key !== 'id_categoria_pai' || row.id !== editor.id)
                        .map((row) => <option key={row.id} value={row.id}>{field.type === 'categorias' ? categoryPath(row) : row.nome}</option>)}
                    </select> : field.options ? <select className={inputClass} name={field.key} defaultValue={String(value ?? field.initial ?? '')}>
                      {field.options.map((option) => <option key={option}>{option}</option>)}
                    </select> : field.type === 'checkbox' ? <input name={field.key} type="checkbox" defaultChecked={Boolean(value ?? field.initial)} className="size-5" />
                    : <input className={inputClass} name={field.key} required={field.required} maxLength={field.max}
                      type={field.type === 'decimal' ? 'text' : field.type ?? 'text'} inputMode={field.type === 'decimal' ? 'decimal' : undefined}
                      min={field.type === 'number' ? 1 : undefined} max={field.type === 'number' ? 32767 : undefined}
                      minLength={field.type === 'password' ? 12 : undefined} autoComplete={field.type === 'password' ? 'new-password' : undefined}
                      defaultValue={String(value ?? field.initial ?? '')} />}
                </label>;
              })}
              {optionError && <p role="alert">{optionError.message}</p>}
              {save.isError && <p role="alert" className="text-red-300">{save.error.message}</p>}
              <button className={buttonClass} disabled={save.isPending}>{save.isPending ? 'Salvando…' : 'Salvar'}</button>
            </form>
          )}
        </section>
      )}
      {confirm && (
        <dialog ref={(dialog) => { if (dialog && !dialog.open) dialog.showModal(); }}
          onCancel={(event) => { event.preventDefault(); if (!save.isPending) setConfirm(undefined); }} aria-labelledby="confirm-title" className="fixed inset-0 z-10 m-auto w-[min(90vw,28rem)] rounded-xl bg-slate-900 p-6 shadow-2xl backdrop:bg-black/70">
          <h2 id="confirm-title" className="font-semibold">{confirm.ativo ? 'Confirmar desativação?' : 'Confirmar ativação?'}</h2>
          {save.isError && <p role="alert" className="mt-2 text-red-300">{save.error.message}</p>}
          <div className="mt-4 flex gap-2">
            <button className={buttonClass} disabled={save.isPending} onClick={() => setConfirm(undefined)}>Cancelar</button>
            <button className={buttonClass} disabled={save.isPending}
              onClick={() => save.mutate({ path: module + '/' + confirm.id + '/status', method: 'PATCH', body: { ativo: !confirm.ativo } })}>Confirmar</button>
          </div>
        </dialog>
      )}
    </section>
  );
}
