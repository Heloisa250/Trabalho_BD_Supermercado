export type Field = { key: string; label: string; type?: string; required?: boolean; max?: number; initial?: string; options?: string[] };

const official = import.meta.env.MODE === 'official';

export const modules = {
  categorias: { title: 'Categorias', columns: ['nome', 'pai', 'descricao'], fields: [
    { key: 'nome', label: 'Nome', required: true, max: 60 },
    { key: 'id_categoria_pai', label: 'Categoria pai', type: 'categorias' },
    { key: 'descricao', label: 'Descrição', max: 255 },
  ] },
  marcas: { title: 'Marcas', columns: ['nome', 'fabricante'], fields: [
    { key: 'nome', label: 'Nome', required: true, max: 60 },
    { key: 'fabricante', label: 'Fabricante', max: 100 },
  ] },
  produtos: { title: 'Produtos', columns: ['codigo_barras', 'nome', 'categoria', 'marca', 'preco_venda', 'ativo'], fields: [
    { key: 'codigo_barras', label: 'Código de barras', required: true, max: 14 },
    { key: 'nome', label: 'Nome', required: true, max: 120 },
    { key: 'descricao', label: 'Descrição', max: 255 },
    { key: 'id_categoria', label: 'Categoria', type: 'categorias', required: true },
    { key: 'id_marca', label: 'Marca', type: 'marcas' },
    { key: 'unidade_medida', label: 'Unidade de medida', options: official ? ['UN', 'KG', 'L'] : ['UN', 'KG', 'L', 'CX', 'PCT'], initial: 'UN' },
    { key: 'preco_venda', label: 'Preço de venda', type: 'decimal', required: true },
    { key: 'estoque_minimo', label: 'Estoque mínimo', type: 'decimal', required: true, initial: '0' },
    { key: 'estoque_maximo', label: 'Estoque máximo', type: 'decimal', required: true, initial: '0' },
    { key: 'ativo', label: 'Ativo', type: 'checkbox', initial: 'true' },
  ] },
  fornecedores: { title: 'Fornecedores', columns: ['razao_social', 'nome_fantasia', 'cnpj', 'telefone', 'email', 'ativo'], fields: [
    { key: 'razao_social', label: 'Razão social', required: true, max: 120 },
    { key: 'nome_fantasia', label: 'Nome fantasia', max: 120 },
    { key: 'cnpj', label: 'CNPJ', required: true, max: 18 },
    { key: 'telefone', label: 'Telefone', max: 20 },
    { key: 'email', label: 'E-mail', type: 'email', max: 100 },
    { key: 'endereco', label: 'Endereço', max: 200 },
    ...(official ? [{ key: 'ativo', label: 'Ativo', type: 'checkbox', initial: 'true' }] : []),
  ] },
  funcionarios: {
    title: 'Funcionários',
    columns: ['nome', 'matricula', 'cargo', 'ativo'],
    fields: [
      { key: 'nome', label: 'Nome', required: true, max: 100 },
      { key: 'matricula', label: 'Matrícula', required: true, max: 20 },
      { key: 'cpf', label: 'CPF (11 dígitos)', required: true, max: 11 },
      { key: 'id_cargo', label: 'Cargo', type: 'cargo', required: true },
      { key: 'email', label: 'E-mail', type: 'email', max: 100 },
      { key: 'telefone', label: 'Telefone', max: 20 },
      { key: 'salario', label: 'Salário', type: 'decimal', required: true },
      { key: 'data_admissao', label: 'Data de admissão', type: 'date', required: true },
      { key: 'data_demissao', label: 'Data de demissão', type: 'date' },
      { key: 'senha', label: 'Senha inicial (mínimo de 12 caracteres)', type: 'password', required: true },
      { key: 'ativo', label: 'Ativo', type: 'checkbox', initial: 'true' },
    ],
  },
  cargos: {
    title: 'Cargos', columns: ['nome', 'descricao', 'pode_cancelar_item'],
    fields: [
      { key: 'nome', label: 'Nome', required: true, max: 50 },
      { key: 'descricao', label: 'Descrição', max: 255 },
      { key: 'pode_cancelar_item', label: 'Pode autorizar cancelamento', type: 'checkbox' },
    ],
  },
  caixas: {
    title: 'Terminais de caixa', columns: ['numero', 'descricao', 'ativo'],
    fields: [
      { key: 'numero', label: 'Número', type: 'number', required: true },
      { key: 'descricao', label: 'Descrição', max: 60 },
      { key: 'ativo', label: 'Ativo', type: 'checkbox', initial: 'true' },
    ],
  },
  'formas-pagamento': {
    title: 'Formas de pagamento', columns: ['descricao', 'permite_troco', 'ativo'],
    fields: [
      { key: 'descricao', label: 'Descrição', required: true, max: 40 },
      { key: 'permite_troco', label: 'Permite troco', type: 'checkbox' },
      { key: 'ativo', label: 'Ativo', type: 'checkbox', initial: 'true' },
    ],
  },
} satisfies Record<string, { title: string; columns: string[]; fields: Field[] }>;

export type Module = keyof typeof modules;

export const labels: Record<string, string> = {
  pai: 'Categoria pai', fabricante: 'Fabricante', categoria: 'Categoria', marca: 'Marca',
  codigo_barras: 'Código de barras', preco_venda: 'Preço de venda', razao_social: 'Razão social',
  nome_fantasia: 'Nome fantasia', cnpj: 'CNPJ', telefone: 'Telefone', email: 'E-mail',
  nome: 'Nome', matricula: 'Matrícula', cargo: 'Cargo', ativo: 'Situação', descricao: 'Descrição',
  pode_cancelar_item: 'Autoriza cancelamento', numero: 'Número', permite_troco: 'Permite troco',
};

export const inputClass = 'rounded-lg border border-slate-400 bg-white px-3 py-2';
export const buttonClass = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium disabled:opacity-50';
