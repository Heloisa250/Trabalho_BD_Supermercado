import { z } from 'zod';

export const id = z.coerce.number().int().min(1).max(2147483647);
const label = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => label(max).nullable().optional();
export const status = z.object({ ativo: z.boolean() }).strict();
export const password = z.string().min(12).refine((s) =>
  Buffer.byteLength(s, 'utf8') <= 72 && /\p{L}/u.test(s) && /[^\p{L}\s]/u.test(s),
  'Use pelo menos 12 caracteres, com letras e números ou símbolos, até 72 bytes.');

const cpf = z.string().regex(/^\d{11}$/).refine((value) => {
  if (/^(\d)\1{10}$/.test(value)) return false;
  return [9, 10].every((length) => {
    const sum = [...value.slice(0, length)].reduce((total, digit, index) =>
      total + Number(digit) * (length + 1 - index), 0);
    return (sum * 10 % 11) % 10 === Number(value[length]);
  });
}, 'CPF inválido.');

const date = z.iso.date().refine((value) => value >= '1000-01-01');
const employee = z.object({
  nome: label(100), matricula: label(20).regex(/^[\p{L}\p{N}._-]+$/u), cpf,
  id_cargo: z.number().int().positive().max(2147483647),
  email: z.email().max(100).nullable().optional(),
  telefone: optionalText(20), salario: z.string().regex(/^\d{1,8}(?:\.\d{1,2})?$/),
  data_admissao: date, data_demissao: date.nullable().optional(),
}).strict();

const cargo = z.object({
  nome: label(50), descricao: optionalText(255), pode_cancelar_item: z.boolean(),
}).strict();
const caixa = z.object({ numero: z.number().int().min(1).max(32767), descricao: optionalText(60) }).strict();
const forma = z.object({ descricao: label(40), permite_troco: z.boolean() }).strict();

export const money = z.string().regex(/^\d{1,8}(?:\.\d{1,2})?$/);
const quantity = z.string().regex(/^\d{1,7}(?:\.\d{1,3})?$/);
const ref = z.number().int().min(1).max(2147483647);
const cnpj = z.string().trim().regex(/^(?:\d{14}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})$/)
  .transform((value) => value.replace(/\D/g, ''))
  .refine((value) => !/^(\d)\1{13}$/.test(value) && [12, 13].every((length) => {
    const sum = [...value.slice(0, length)].reduce((total, digit, index) =>
      total + Number(digit) * ((length - index - 1) % 8 + 2), 0);
    return (sum % 11 < 2 ? 0 : 11 - sum % 11) === Number(value[length]);
  }), 'CNPJ inválido.');

const categoria = z.object({ nome: label(60), descricao: optionalText(255), id_categoria_pai: ref.nullable().optional() }).strict();
const marca = z.object({ nome: label(60), fabricante: optionalText(100) }).strict();
const produto = z.object({
  codigo_barras: label(14), nome: label(120), descricao: optionalText(255), id_categoria: ref,
  id_marca: ref.nullable().optional(), unidade_medida: z.enum(['UN', 'KG', 'L', 'CX', 'PCT']).optional(),
  preco_venda: money, estoque_minimo: quantity.optional(), estoque_maximo: quantity.optional(), ativo: z.boolean().optional(),
}).strict();
const fornecedor = z.object({
  razao_social: label(120), nome_fantasia: optionalText(120), cnpj, telefone: optionalText(20),
  email: z.email().max(100).nullable().optional(), endereco: optionalText(200),
}).strict();

export const schemas = {
  categorias: { create: categoria, edit: categoria.partial() },
  marcas: { create: marca, edit: marca.partial() },
  produtos: { create: produto, edit: produto.omit({ ativo: true }).partial() },
  fornecedores: { create: fornecedor, edit: fornecedor.partial() },
  funcionarios: { create: employee.extend({ senha: password, ativo: z.boolean().optional() }), edit: employee.partial() },
  cargos: { create: cargo, edit: cargo.partial() },
  caixas: { create: caixa.extend({ ativo: z.boolean().optional() }), edit: caixa.partial() },
  'formas-pagamento': { create: forma.extend({ ativo: z.boolean().optional() }), edit: forma.partial() },
};

const officialProduct = produto.extend({
  unidade_medida: z.enum(['UN', 'KG', 'L']),
  estoque_minimo: quantity,
  estoque_maximo: quantity,
  ativo: z.boolean(),
});

export const officialProductEdit = officialProduct.omit({ ativo: true }).partial();

export const officialCreates = {
  produtos: officialProduct,
  fornecedores: fornecedor.extend({ ativo: z.boolean() }),
  funcionarios: schemas.funcionarios.create.extend({ ativo: z.boolean() }),
  caixas: schemas.caixas.create.extend({ ativo: z.boolean() }),
  'formas-pagamento': schemas['formas-pagamento'].create.extend({ ativo: z.boolean() }),
};

export const list = z.object({
  pagina: z.coerce.number().int().min(1).max(100000).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
  busca: z.string().trim().max(100).optional(),
  cargo: id.optional(),
  categoria: id.optional(),
  marca: id.optional(),
  fornecedor: id.optional(),
  fabricante: z.string().trim().max(100).optional(),
  ordem: z.enum(['id', 'nome', 'codigo_barras', 'preco_venda']).default('id'),
  direcao: z.enum(['asc', 'desc']).default('asc'),
  ativo: z.enum(['true', 'false']).optional(),
}).strict();
