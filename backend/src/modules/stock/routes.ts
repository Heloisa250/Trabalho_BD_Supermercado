import { Router, type RequestHandler } from 'express';
import type { Pool, PoolConnection, ProcedureCallPacket, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { nextExplicitId, transaction } from '../../config/mysql-transaction.js';
import { businessDate, sqlBusinessDate } from '../../config/business-time.js';
import { parse } from '../admin/controller.js';
import { AdminError } from '../admin/error.js';
import { id, money } from '../admin/schemas.js';

const quantity = z.string().regex(/^\d{1,7}(?:\.\d{1,3})?$/);
function milli(value: string) {
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
}
function decimal(value: number) {
  return (value < 0 ? '-' : '') + Math.floor(Math.abs(value) / 1000) + '.' + String(Math.abs(value) % 1000).padStart(3, '0');
}
const positive = quantity.refine(value => milli(value) > 0);
const date = z.iso.date().refine(value => value >= '1000-01-01').nullable().optional();
const lotFields = z.object({
  id_produto: z.number().int().min(1).max(2147483647),
  codigo_lote: z.string().trim().min(1).max(30),
  data_fabricacao: date, data_validade: date, quantidade: positive,
}).strict();
function orderedDates(data: z.infer<typeof lotFields>) {
  return !data.data_fabricacao || !data.data_validade || data.data_fabricacao <= data.data_validade;
}
const receipt = z.object({ lotes: z.array(lotFields.refine(orderedDates)).min(1) }).strict();
const entry = lotFields.extend({ custo_unitario: money }).refine(orderedDates);
const reason = z.string().trim().min(1).max(255);
const loss = z.object({ quantidade: positive, motivo: reason }).strict();
const adjustment = z.object({ saldo: quantity, motivo: reason }).strict();
const paging = z.object({
  pagina: z.coerce.number().int().min(1).max(100000).default(1),
  produto: id.optional(), busca: z.string().trim().max(120).default(''),
  dias: z.coerce.number().int().min(0).max(365).default(30),
});
const lotsFilter = paging.extend({ validade: z.enum(['vencido','proximo','sem']).optional() }).strict();
const stockFilter = paging.extend({ faixa: z.enum(['baixo','normal','alto']).optional() }).strict();
const historyFilter = paging.extend({ tipo: z.enum(['ENTRADA','PERDA','AJUSTE','SAIDA_VENDA']).optional() }).strict();
const PAGE = 20;
// Lock nomeado do estoque: protege lote e o alocador de movimentacao_estoque. A finalização de venda
// (Script 09) também o adquire, sempre DEPOIS do lock do PDV.
export const STOCK_LOCK = 'sqlider:Supermercado:estoque';
type Lot = z.infer<typeof lotFields>;

export function stockRoutes(pool: Pool | undefined, session: RequestHandler, admin: RequestHandler, csrf: RequestHandler, academic = false) {
  const router = Router();
  router.use((req, _res, next) => {
    next(/^\/(?:lotes(?:\/|$)|estoque(?:\/|$)|produtos\/[^/]+\/lotes\/?$|pedidos-compra\/[^/]+\/receber\/?$)/i.test(req.path) ? undefined : 'router');
  }, session, admin);
  function db() {
    if (!pool) throw new AdminError(503, 'DATABASE_UNAVAILABLE', 'Banco indisponível.');
    return pool;
  }
  // Todas as escritas de estoque compartilham o lock que protege os dois alocadores.
  const write = <T>(run: (conn: PoolConnection) => Promise<T>) => transaction(db(), run, STOCK_LOCK);
  async function rows(conn: Pool | PoolConnection, sql: string, args: (string | number | null)[] = []) {
    const [result] = await conn.execute<RowDataPacket[]>(sql, args);
    return result;
  }
  async function page(sql: string, args: (string | number | null)[], pagina: number) {
    const result = await rows(db(), sql + ' LIMIT ? OFFSET ?', [...args, PAGE + 1, (pagina - 1) * PAGE]);
    return { items: result.slice(0, PAGE), pagina, mais: result.length > PAGE };
  }
  async function movement(conn: PoolConnection, lot: number, employee: number, type: 'ENTRADA' | 'PERDA' | 'AJUSTE', amount: string, note: string | null) {
    const key = await nextExplicitId(conn, 'movimentacao_estoque', 'id_movimentacao');
    await conn.execute(`INSERT INTO movimentacao_estoque
      (id_movimentacao,id_lote,id_funcionario,tipo,quantidade,data_hora,observacao)
      VALUES (?,?,?,?,?,CURRENT_TIMESTAMP,?)`, [key, lot, employee, type, amount, note]);
    return key;
  }
  async function validateLot(conn: PoolConnection, lot: Lot, today: string) {
    if (lot.data_fabricacao && lot.data_fabricacao > today) {
      throw new AdminError(400, 'INVALID_DATES', 'A fabricação não pode ser posterior à entrada.');
    }
    const existing = await rows(conn, 'SELECT id_lote FROM lote WHERE id_produto=? AND codigo_lote=? FOR SHARE',
      [lot.id_produto, lot.codigo_lote]);
    if (existing.length) throw new AdminError(409, 'DUPLICATE_LOT', 'Já existe um lote com esse código para o produto.');
  }
  async function insertLot(conn: PoolConnection, lot: Lot, order: number | null, cost: string, employee: number) {
    const key = await nextExplicitId(conn, 'lote', 'id_lote');
    await conn.execute(`INSERT INTO lote (id_lote,id_produto,id_pedido,codigo_lote,data_fabricacao,data_validade,
      data_entrada,quantidade_inicial,quantidade_atual,custo_unitario) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP,?,?,?)`,
    [key, lot.id_produto, order, lot.codigo_lote, lot.data_fabricacao ?? null, lot.data_validade ?? null,
      lot.quantidade, lot.quantidade, cost]);
    const movementId = await movement(conn, key, employee, 'ENTRADA', lot.quantidade, order === null ? 'Entrada independente' : 'Recebimento do pedido #' + order);
    return { id_lote: key, id_movimentacao: movementId };
  }
  router.post('/pedidos-compra/:id/receber', csrf, async (req, res) => {
    const order = parse(id, req.params.id);
    const { lotes } = parse(receipt, req.body);
    const result = await write(async conn => {
      const [current] = await rows(conn, 'SELECT status,data_recebimento,' + sqlBusinessDate() + ' AS hoje FROM pedido_compra WHERE id_pedido=? FOR UPDATE', [order]);
      if (!current) throw new AdminError(404, 'NOT_FOUND', 'Pedido não encontrado.');
      if (current.status !== 'ENVIADO' || current.data_recebimento !== null ||
          (await rows(conn, 'SELECT id_lote FROM lote WHERE id_pedido=? LIMIT 1 FOR SHARE', [order])).length) {
        throw new AdminError(409, 'ORDER_NOT_RECEIVABLE', 'O pedido não está disponível para recebimento.');
      }
      const items = await rows(conn, 'SELECT id_produto,quantidade,custo_unitario FROM item_pedido_compra WHERE id_pedido=? FOR UPDATE', [order]);
      const expected = new Map(items.map(item => [Number(item.id_produto), item]));
      const totals = new Map<number, number>();
      const codes = new Set<string>();
      for (const lot of lotes) {
        if (!expected.has(lot.id_produto)) throw new AdminError(409, 'UNEXPECTED_PRODUCT', 'O produto não faz parte do pedido.');
        const code = lot.id_produto + ':' + lot.codigo_lote.toLowerCase();
        if (codes.has(code)) throw new AdminError(409, 'DUPLICATE_LOT', 'Código de lote repetido para o produto.');
        codes.add(code);
        totals.set(lot.id_produto, (totals.get(lot.id_produto) ?? 0) + milli(lot.quantidade));
      }
      if (items.some(item => totals.get(item.id_produto) !== milli(item.quantidade))) {
        throw new AdminError(409, 'RECEIPT_QUANTITY', 'As quantidades dos lotes devem corresponder integralmente ao pedido.');
      }
      for (const lot of lotes) await validateLot(conn, lot, current.hoje);
      const created = [];
      for (const lot of lotes) created.push(await insertLot(conn, lot, order, expected.get(lot.id_produto)!.custo_unitario, res.locals.employee.id));
      await conn.execute("UPDATE pedido_compra SET status='RECEBIDO',data_recebimento=CURRENT_TIMESTAMP WHERE id_pedido=?", [order]);
      const [saved] = await rows(conn, 'SELECT status,data_recebimento FROM pedido_compra WHERE id_pedido=?', [order]);
      return { id_pedido: order, status: saved.status, data_recebimento: saved.data_recebimento, lotes: created };
    });
    res.json(result);
  });
  router.post('/estoque/entradas', csrf, async (req, res) => {
    const data = parse(entry, req.body);
    res.status(201).json(await write(async conn => {
      const [product] = await rows(conn, 'SELECT ' + sqlBusinessDate() + ' AS hoje FROM produto WHERE id_produto=? FOR SHARE', [data.id_produto]);
      if (!product) throw new AdminError(404, 'NOT_FOUND', 'Produto não encontrado.');
      await validateLot(conn, data, product.hoje);
      return insertLot(conn, data, null, data.custo_unitario, res.locals.employee.id);
    }));
  });
  for (const type of ['PERDA', 'AJUSTE'] as const) {
    router.post('/lotes/:id/' + (type === 'PERDA' ? 'perdas' : 'ajustes'), csrf, async (req, res) => {
      const key = parse(id, req.params.id);
      const data = type === 'PERDA' ? parse(loss, req.body) : parse(adjustment, req.body);
      res.status(201).json(await write(async conn => {
        const [lot] = await rows(conn, 'SELECT quantidade_atual FROM lote WHERE id_lote=? FOR UPDATE', [key]);
        if (!lot) throw new AdminError(404, 'NOT_FOUND', 'Lote não encontrado.');
        const before = milli(lot.quantidade_atual);
        const after = 'saldo' in data ? milli(data.saldo) : before - milli(data.quantidade);
        if (after < 0) throw new AdminError(409, 'INSUFFICIENT_STOCK', 'O lote não tem saldo suficiente.');
        if (after === before) throw new AdminError(409, 'UNCHANGED_STOCK', 'O saldo informado já está registrado.');
        await conn.execute('UPDATE lote SET quantidade_atual=? WHERE id_lote=?', [decimal(after), key]);
        const movementId = await movement(conn, key, res.locals.employee.id, type,
          decimal(type === 'PERDA' ? before - after : after - before), data.motivo);
        return { id_lote: key, id_movimentacao: movementId, quantidade_atual: decimal(after) };
      }));
    });
  }
  const lotSelect = 'SELECT l.*,p.nome AS produto,p.unidade_medida FROM lote l JOIN produto p USING(id_produto)';
  router.get(['/lotes', '/produtos/:id/lotes'], async (req, res) => {
    const data = parse(lotsFilter, req.query);
    const product = req.params.id === undefined ? data.produto : parse(id, req.params.id);
    const today = sqlBusinessDate();
    const validity = {
      vencido: 'l.data_validade<' + today,
      proximo: 'l.data_validade BETWEEN ' + today + ' AND DATE_ADD(' + today + ', INTERVAL ? DAY)',
      sem: 'l.data_validade IS NULL',
    };
    res.json(await page(lotSelect + ' WHERE (? IS NULL OR l.id_produto=?) AND (LOCATE(?,p.nome)>0 OR LOCATE(?,l.codigo_lote)>0)' +
      (data.validade ? ' AND ' + validity[data.validade] : '') + ' ORDER BY l.id_lote DESC',
    [product ?? null, product ?? null, data.busca, data.busca, ...(data.validade === 'proximo' ? [data.dias] : [])], data.pagina));
  });
  router.get('/lotes/:id', async (req, res) => {
    const [lot] = await rows(db(), lotSelect + ' WHERE l.id_lote=?', [parse(id, req.params.id)]);
    if (!lot) throw new AdminError(404, 'NOT_FOUND', 'Lote não encontrado.');
    res.json(lot);
  });
  router.get('/estoque', async (req, res) => {
    const data = parse(stockFilter, req.query);
    const today = sqlBusinessDate();
    res.json(await page(`SELECT * FROM (
      SELECT p.id_produto,p.nome,p.codigo_barras,c.nome AS categoria,p.unidade_medida,p.ativo,p.estoque_minimo,p.estoque_maximo,
      COALESCE(s.fisico,0) AS fisico, COALESCE(s.vencido,0) AS vencido,
      IF(p.ativo=1,COALESCE(s.disponivel,0),0) AS disponivel, COALESCE(s.proximo,0) AS proximo,COALESCE(s.lotes,0) AS lotes,
      CASE WHEN COALESCE(s.fisico,0)<p.estoque_minimo THEN 'baixo'
           WHEN COALESCE(s.fisico,0)>p.estoque_maximo THEN 'alto' ELSE 'normal' END AS faixa
      FROM produto p JOIN categoria c USING(id_categoria) LEFT JOIN (
        SELECT id_produto,COUNT(*) AS lotes,SUM(quantidade_atual) AS fisico,
          SUM(IF(data_validade<${today},quantidade_atual,0)) AS vencido,
          SUM(IF(data_validade IS NULL OR data_validade>=${today},quantidade_atual,0)) AS disponivel,
          SUM(IF(data_validade BETWEEN ${today} AND DATE_ADD(${today},INTERVAL ? DAY),quantidade_atual,0)) AS proximo
        FROM lote GROUP BY id_produto
      ) s USING(id_produto)
      WHERE (? IS NULL OR p.id_produto=?) AND (LOCATE(?,p.nome)>0 OR LOCATE(?,p.codigo_barras)>0)
      ) saldo WHERE (? IS NULL OR faixa=?) ORDER BY nome,id_produto`,
    [data.dias, data.produto ?? null, data.produto ?? null, data.busca, data.busca, data.faixa ?? null, data.faixa ?? null], data.pagina));
  });
  if (academic) router.get('/estoque/produtos/:id', async (req, res) => {
    const key = parse(id, req.params.id);
    try {
      const [result] = await db().execute<ProcedureCallPacket<RowDataPacket[]>>(
        'CALL sp_consultar_estoque_produto(?, ?)', [key, businessDate()]);
      res.json(result[0][0]);
    } catch (error) {
      if ((error as { sqlState?: string }).sqlState === '45000') {
        throw new AdminError(404, 'NOT_FOUND', 'Produto não encontrado.');
      }
      throw error;
    }
  });
  router.get('/estoque/movimentacoes', async (req, res) => {
    const data = parse(historyFilter, req.query);
    res.json(await page(`SELECT m.*,l.codigo_lote,p.nome AS produto,f.nome AS funcionario
      FROM movimentacao_estoque m JOIN lote l USING(id_lote) JOIN produto p USING(id_produto)
      LEFT JOIN funcionario f ON f.id_funcionario=m.id_funcionario
      WHERE (? IS NULL OR l.id_produto=?) AND (? IS NULL OR m.tipo=?)
      AND (LOCATE(?,p.nome)>0 OR LOCATE(?,l.codigo_lote)>0) ORDER BY m.data_hora DESC,m.id_movimentacao DESC`,
    [data.produto ?? null, data.produto ?? null, data.tipo ?? null, data.tipo ?? null, data.busca, data.busca], data.pagina));
  });
  return router;
}
