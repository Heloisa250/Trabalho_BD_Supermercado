import { Router, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Pool } from 'mysql2/promise';
import { z } from 'zod';
import { transaction } from '../../config/mysql-transaction.js';
import { parse } from '../admin/controller.js';
import { AdminError } from '../admin/error.js';
import { id } from '../admin/schemas.js';
import type { AuthService } from '../auth/service.js';
import { salesRepository } from './repository.js';
import { salesService } from './service.js';
import { STOCK_LOCK } from '../stock/routes.js';

// Lock nomeado único do PDV: protege os alocadores de venda, item_venda e cancelamento_item.
export const SALES_LOCK = 'sqlider:Supermercado:venda';

const quantity = z.string().regex(/^\d{1,7}(?:\.\d{1,3})?$/);
// Código de barras é texto: zeros à esquerda preservados, nunca convertido para Number.
const barcode = z.string().trim().min(1).max(14).regex(/^[\p{L}\p{N}._-]+$/u);
const addItem = z.union([
  z.object({ codigo_barras: barcode, quantidade: quantity }).strict(),
  z.object({ id_produto: z.number().int().min(1).max(2147483647), quantidade: quantity }).strict(),
]);
const editItem = z.object({ quantidade: quantity }).strict();
const cancelItem = z.object({
  motivo: z.string().trim().min(3).max(255),
  supervisor: z.object({ matricula: z.string().trim().min(1).max(20), senha: z.string().min(1).max(200) }).strict(),
}).strict();
// Somente a composição dos pagamentos: total, status, lotes e operador são decididos pelo servidor.
const payment = z.object({
  id_forma_pagamento: z.number().int().min(1).max(2147483647),
  valor: z.string().regex(/^\d{1,8}(?:\.\d{1,2})?$/),
  valor_recebido: z.string().regex(/^\d{1,8}(?:\.\d{1,2})?$/).optional(),
}).strict();
const finalize = z.object({ pagamentos: z.array(payment).min(1).max(5) }).strict();
const cancelSale = z.object({ confirmar: z.literal(true) }).strict();
const empty = z.object({}).strict();
const listFilter = z.object({
  status: z.enum(['ABERTA', 'FINALIZADA', 'CANCELADA']).optional(),
  pagina: z.coerce.number().int().min(1).max(100000).default(1),
}).strict();
const lookup = z.union([
  z.object({ codigo_barras: barcode }).strict(),
  z.object({ busca: z.string().trim().min(2).max(120) }).strict(),
]);

export function salesRoutes(pool: Pool | undefined, auth: AuthService, csrf: RequestHandler) {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  function db() {
    if (!pool) throw new AdminError(503, 'DATABASE_UNAVAILABLE', 'Banco indisponível.');
    return pool;
  }
  const service = () => salesService({
    read: salesRepository(db()),
    write: run => transaction(db(), conn => run(salesRepository(conn)), SALES_LOCK),
    checkout: run => transaction(db(), conn => run(salesRepository(conn)), [SALES_LOCK, STOCK_LOCK]),
    verify: auth.verify,
  });
  const supervisorLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: { code: 'TOO_MANY_ATTEMPTS', message: 'Muitas tentativas de autorização. Aguarde e tente novamente.' } },
  });
  const me = (res: { locals: Record<string, any> }) => res.locals.employee.id as number;

  // Rotas literais antes das rotas com parâmetro.
  router.get('/', async (req, res) => {
    const query = parse(listFilter, req.query);
    res.json(await service().list(me(res), query.status ?? null, query.pagina));
  });
  router.get('/ativa', async (_req, res) => { res.json(await service().active(me(res))); });
  router.get('/produtos', async (req, res) => { res.json(await service().lookup(parse(lookup, req.query))); });
  router.post('/', csrf, async (req, res) => {
    parse(empty, req.body ?? {});
    const sale = await service().open(me(res));
    res.status(sale.recuperada ? 200 : 201).json(sale);
  });
  router.get('/:id', async (req, res) => { res.json(await service().detail(parse(id, req.params.id), me(res))); });
  router.get('/:id/itens', async (req, res) => { res.json(await service().items(parse(id, req.params.id), me(res))); });
  router.get('/:id/pagamento/resumo', async (req, res) => { res.json(await service().paymentSummary(parse(id, req.params.id), me(res))); });
  router.get('/:id/pagamentos', async (req, res) => { res.json(await service().payments(parse(id, req.params.id), me(res))); });
  router.get('/:id/comprovante', async (req, res) => { res.json(await service().receipt(parse(id, req.params.id), me(res))); });
  router.post('/:id/finalizar', csrf, async (req, res) => {
    const input = parse(finalize, req.body);
    res.json(await service().finalize(parse(id, req.params.id), me(res), input));
  });
  router.post('/:id/cancelar', csrf, async (req, res) => {
    parse(cancelSale, req.body);
    res.json(await service().cancelSale(parse(id, req.params.id), me(res)));
  });
  router.post('/:id/itens', csrf, async (req, res) => {
    const input = parse(addItem, req.body);
    res.status(201).json(await service().addItem(parse(id, req.params.id), me(res), input));
  });
  router.patch('/:id/itens/:idItem', csrf, async (req, res) => {
    const input = parse(editItem, req.body);
    res.json(await service().updateItem(parse(id, req.params.id), parse(id, req.params.idItem), me(res), input.quantidade));
  });
  router.post('/:id/itens/:idItem/cancelar', csrf, supervisorLimiter, async (req, res) => {
    const input = parse(cancelItem, req.body);
    res.json(await service().cancelItem(parse(id, req.params.id), parse(id, req.params.idItem), me(res), input));
  });
  return router;
}
