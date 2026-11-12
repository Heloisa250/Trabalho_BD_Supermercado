import { z } from 'zod';
import { id, money } from '../admin/schemas.js';

const ref = z.number().int().min(1).max(2147483647);
const date = z.iso.date().refine((value) => value >= '1000-01-01');
const fields = z.object({
  id_fornecedor: ref,
  data_prevista: date.nullable().optional(),
  observacao: z.string().trim().max(255).nullable().optional(),
}).strict();

const terms = z.object({
  quantidade: z.string().regex(/^\d{1,7}(?:\.\d{1,3})?$/).refine((value) => /[1-9]/.test(value)),
  custo_unitario: money,
}).strict();

export const item = terms.extend({ id_produto: ref });
export const editItem = terms.partial().refine((data) => Object.keys(data).length > 0);
export const createOrder = fields.extend({ itens: z.array(item).max(100).optional() });
export const editOrder = fields.partial().refine((data) => Object.keys(data).length > 0);
export const filters = z.object({
  numero: id.optional(), fornecedor: id.optional(), funcionario: id.optional(),
  status: z.enum(['ABERTO', 'PENDENTE', 'ENVIADO', 'RECEBIDO', 'CANCELADO']).optional(),
  inicio: date.optional(), fim: date.optional(),
  pagina: z.coerce.number().int().min(1).max(100000).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
  ordem: z.enum(['data', 'numero']).default('data'),
  direcao: z.enum(['asc', 'desc']).default('desc'),
}).strict().refine((data) => !data.inicio || !data.fim || data.inicio <= data.fim);
export const offersFilter = z.object({ busca: z.string().trim().max(120).default(''),
  pagina: z.coerce.number().int().min(1).max(100000).default(1) }).strict();
