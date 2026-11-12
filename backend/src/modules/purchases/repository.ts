import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { nextExplicitId, transaction } from '../../config/mysql-transaction.js';
import type { z } from 'zod';
import { AdminError, type Fields } from '../admin/repository.js';
import type { filters } from './schemas.js';

type Connection = Pool | PoolConnection;
type Order = RowDataPacket & { id_fornecedor: number; data_recebimento: string | null; status: 'PENDENTE' | 'ABERTO' | 'ENVIADO' | 'RECEBIDO' | 'CANCELADO' };

const from = `FROM pedido_compra pc JOIN fornecedor f ON f.id_fornecedor=pc.id_fornecedor
  JOIN funcionario u ON u.id_funcionario=pc.id_funcionario`;
const subtotal = 'ROUND(i.quantidade * i.custo_unitario, 2)';
const select = `SELECT pc.*, f.razao_social AS fornecedor, u.nome AS funcionario,
  (SELECT COUNT(*) FROM item_pedido_compra i WHERE i.id_pedido=pc.id_pedido) AS quantidade_itens,
  (SELECT COALESCE(SUM(${subtotal}), 0.00) FROM item_pedido_compra i WHERE i.id_pedido=pc.id_pedido) AS total_estimado ${from}`;

export function purchasesRepository(pool: Pool | undefined, official: boolean) {
  function db() {
    if (!pool) throw new AdminError(503, 'DATABASE_UNAVAILABLE', 'Banco indisponível.');
    return pool;
  }
  async function rows<T extends RowDataPacket = RowDataPacket>(conn: Connection, sql: string, values: (string | number)[]) {
    const [result] = await conn.execute<T[]>(sql, values);
    return result;
  }
  async function order(id: number, conn: Connection = db(), lock = false) {
    const [result] = await rows<Order>(conn, lock
      ? 'SELECT id_fornecedor,status,data_recebimento FROM pedido_compra WHERE id_pedido=? FOR UPDATE'
      : select + ' WHERE pc.id_pedido=?', [id]);
    if (!result) throw new AdminError(404, 'NOT_FOUND', 'Pedido não encontrado.');
    return result;
  }
  return {
    order,
    transaction<T>(action: (conn: PoolConnection) => Promise<T>, creating = false) {
      return transaction(db(), action, official && creating ? 'sqlider:Supermercado:pedido_compra' : undefined);
    },
    async hasReceipt(conn: Connection, id: number) {
      return official && (await rows(conn, 'SELECT id_lote FROM lote WHERE id_pedido=? LIMIT 1 FOR SHARE', [id])).length > 0;
    },
    async list(data: z.infer<typeof filters>) {
      const where: string[] = [];
      const values: (string | number)[] = [];
      const fields = { numero: 'id_pedido', fornecedor: 'id_fornecedor', funcionario: 'id_funcionario', status: 'status' } as const;
      for (const field of Object.keys(fields) as (keyof typeof fields)[]) {
        if (data[field] !== undefined) { where.push('pc.' + fields[field] + '=?'); values.push(data[field]); }
      }
      if (data.inicio) { where.push('pc.data_pedido>=?'); values.push(data.inicio); }
      if (data.fim) { where.push('pc.data_pedido<=?'); values.push(data.fim + ' 23:59:59'); }
      const direction = data.direcao === 'asc' ? 'ASC' : 'DESC';
      const orderBy = data.ordem === 'data' ? 'pc.data_pedido ' + direction + ', ' : '';
      const result = await rows(db(), select + (where.length ? ' WHERE ' + where.join(' AND ') : '') +
        ' ORDER BY ' + orderBy + 'pc.id_pedido ' + direction + ' LIMIT ? OFFSET ?',
        [...values, data.limite + 1, (data.pagina - 1) * data.limite]);
      return { items: result.slice(0, data.limite), pagina: data.pagina, mais: result.length > data.limite };
    },
    async items(id: number, conn: Connection = db()) {
      return rows(conn, `SELECT i.*, p.nome, p.codigo_barras, p.unidade_medida, ${subtotal} AS subtotal
        FROM item_pedido_compra i JOIN produto p ON p.id_produto=i.id_produto
        WHERE i.id_pedido=? ORDER BY i.id_produto`, [id]);
    },
    async offers(supplier: number, search: string, page: number) {
      const result = await rows(db(), `SELECT p.id_produto, p.nome, p.codigo_barras, p.unidade_medida, pf.preco_custo
        FROM produto_fornecedor pf JOIN produto p ON p.id_produto=pf.id_produto
        JOIN fornecedor f ON f.id_fornecedor=pf.id_fornecedor
        WHERE pf.id_fornecedor=? AND f.ativo=1 AND p.ativo=1
        AND (LOCATE(?,p.nome)>0 OR LOCATE(?,p.codigo_barras)>0)
        ORDER BY p.nome,p.id_produto LIMIT 21 OFFSET ?`, [supplier, search, search, (page - 1) * 20]);
      return { items: result.slice(0, 20), pagina: page, mais: result.length > 20 };
    },
    async activeSupplier(conn: Connection, id: number) {
      const [supplier] = await rows(conn, 'SELECT ativo FROM fornecedor WHERE id_fornecedor=? FOR SHARE', [id]);
      if (supplier?.ativo !== 1) throw new AdminError(409, 'INVALID_SUPPLIER', 'Fornecedor inexistente ou inativo.');
    },
    async eligibleProduct(conn: Connection, supplier: number, product: number) {
      const [result] = await rows(conn, `SELECT p.ativo, pf.id_fornecedor FROM produto p
        LEFT JOIN produto_fornecedor pf ON pf.id_produto=p.id_produto AND pf.id_fornecedor=?
        WHERE p.id_produto=? FOR SHARE`, [supplier, product]);
      if (result?.ativo !== 1) throw new AdminError(409, 'INVALID_PRODUCT', 'Produto inexistente ou inativo.');
      if (result.id_fornecedor === null) throw new AdminError(409, 'PRODUCT_NOT_LINKED', 'Produto sem vínculo com o fornecedor.');
    },
    async hasItems(conn: Connection, id: number) {
      return (await rows(conn, 'SELECT id_produto FROM item_pedido_compra WHERE id_pedido=? LIMIT 1', [id])).length > 0;
    },
    async create(conn: PoolConnection, supplier: number, employee: number, date?: string | null, note?: string | null) {
      if (official) {
        const id = await nextExplicitId(conn, 'pedido_compra', 'id_pedido');
        await conn.execute(
          'INSERT INTO pedido_compra (id_pedido,id_fornecedor,id_funcionario,data_pedido,data_prevista,observacao,status) VALUES (?,?,?,CURRENT_TIMESTAMP,?,?,?)',
          [id, supplier, employee, date ?? null, note ?? null, 'PENDENTE']);
        return id;
      }
      const [result] = await conn.execute<ResultSetHeader>(
        'INSERT INTO pedido_compra (id_fornecedor,id_funcionario,data_prevista,observacao) VALUES (?,?,?,?)',
        [supplier, employee, date ?? null, note ?? null]);
      return result.insertId;
    },
    async update(conn: Connection, id: number, fields: Fields) {
      const columns = Object.keys(fields).map((key) => key + '=?').join(',');
      await conn.execute('UPDATE pedido_compra SET ' + columns + ' WHERE id_pedido=?', [...Object.values(fields), id]);
    },
    async add(conn: Connection, id: number, product: number, quantity: string, cost: string) {
      await conn.execute('INSERT INTO item_pedido_compra (id_pedido,id_produto,quantidade,custo_unitario) VALUES (?,?,?,?)',
        [id, product, quantity, cost]);
    },
    async edit(conn: Connection, id: number, product: number, fields: Fields) {
      const columns = Object.keys(fields).map((key) => key + '=?').join(',');
      const [result] = await conn.execute<ResultSetHeader>(
        'UPDATE item_pedido_compra SET ' + columns + ' WHERE id_pedido=? AND id_produto=?',
        [...Object.values(fields), id, product]);
      if (!result.affectedRows) throw new AdminError(404, 'ITEM_NOT_FOUND', 'Item não encontrado.');
    },
  };
}

export type PurchasesRepository = ReturnType<typeof purchasesRepository>;
