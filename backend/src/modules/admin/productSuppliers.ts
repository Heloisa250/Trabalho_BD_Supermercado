import type { Router } from 'express';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { parse } from './controller.js';
import { AdminError } from './repository.js';
import { id, list, money } from './schemas.js';

const terms = z.object({
  preco_custo: money,
  prazo_entrega_dias: z.number().int().min(0).max(32767).nullable().optional(),
}).strict();
const create = terms.extend({ id_fornecedor: z.number().int().min(1).max(2147483647) });
const edit = terms.partial().refine((value) => Object.keys(value).length > 0);

export function mountProductSuppliers(router: Router, pool: Pool | undefined, csrf: ReturnType<typeof import('../auth/middleware.js').requireTrustedOrigin>) {
  function db() {
    if (!pool) throw new AdminError(503, 'DATABASE_UNAVAILABLE', 'Banco indisponível.');
    return pool;
  }
  const select = `SELECT pf.id_produto,pf.id_fornecedor,f.razao_social,f.ativo,pf.preco_custo,pf.prazo_entrega_dias
    FROM produto_fornecedor pf JOIN fornecedor f ON f.id_fornecedor=pf.id_fornecedor WHERE pf.id_produto=?`;

  async function detail(product: number, supplier: number) {
    const [rows] = await db().execute<RowDataPacket[]>(select + ' AND pf.id_fornecedor=?', [product, supplier]);
    if (!rows.length) throw new AdminError(404, 'NOT_FOUND', 'Vínculo comercial não encontrado.');
    return rows[0];
  }

  router.get('/:id/fornecedores', async (req, res) => {
    const product = parse(id, req.params.id);
    const { pagina, limite } = parse(list, req.query);
    const [products] = await db().execute<RowDataPacket[]>('SELECT id_produto FROM produto WHERE id_produto=?', [product]);
    if (!products.length) throw new AdminError(404, 'NOT_FOUND', 'Produto não encontrado.');
    const [rows] = await db().execute<RowDataPacket[]>(select + ' ORDER BY pf.id_fornecedor LIMIT ? OFFSET ?',
      [product, limite + 1, (pagina - 1) * limite]);
    res.json({ items: rows.slice(0, limite), pagina, mais: rows.length > limite });
  });

  router.post('/:id/fornecedores', csrf, async (req, res) => {
    const product = parse(id, req.params.id);
    const data = parse(create, req.body);
    await db().execute('INSERT INTO produto_fornecedor (id_produto,id_fornecedor,preco_custo,prazo_entrega_dias) VALUES (?,?,?,?)',
      [product, data.id_fornecedor, data.preco_custo, data.prazo_entrega_dias ?? null]);
    res.status(201).json(await detail(product, data.id_fornecedor));
  });

  router.patch('/:id/fornecedores/:idFornecedor', csrf, async (req, res) => {
    const product = parse(id, req.params.id);
    const supplier = parse(id, req.params.idFornecedor);
    const data = parse(edit, req.body);
    const columns = Object.keys(data).map((key) => key + '=?').join(',');
    const [result] = await db().execute<ResultSetHeader>(
      'UPDATE produto_fornecedor SET ' + columns + ' WHERE id_produto=? AND id_fornecedor=?',
      [...Object.values(data), product, supplier]);
    if (!result.affectedRows) throw new AdminError(404, 'NOT_FOUND', 'Vínculo comercial não encontrado.');
    res.json(await detail(product, supplier));
  });
}
