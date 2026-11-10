import { Router, type RequestHandler } from 'express';
import type { Pool } from 'mysql2/promise';
import { z } from 'zod';
import { AdminError } from '../admin/error.js';
import { parse } from '../admin/controller.js';
import { id } from '../admin/schemas.js';
import { purchasesRepository } from './repository.js';
import { purchasesService } from './service.js';
import { createOrder, editItem, editOrder, filters, item, offersFilter } from './schemas.js';

export function purchaseRoutes(pool: Pool | undefined, csrf: RequestHandler, official: boolean) {
  const router = Router();
  const service = purchasesService(purchasesRepository(pool, official), official);
  router.get('/', async (req, res) => {
    const query = parse(filters, req.query);
    if (query.status === (official ? 'ABERTO' : 'PENDENTE')) {
      throw new AdminError(400, 'INVALID_INPUT', 'Status inválido para este ambiente.');
    }
    res.json(await service.list(query));
  });
  router.get('/fornecedor/:id/produtos', async (req, res) => {
    const query = parse(offersFilter, req.query);
    res.json(await service.offers(parse(id, req.params.id), query.busca, query.pagina));
  });
  router.get('/:id', async (req, res) => { res.json(await service.order(parse(id, req.params.id))); });
  router.post('/', csrf, async (req, res) => {
    res.status(201).json(await service.create(parse(createOrder, req.body), res.locals.employee.id));
  });
  router.patch('/:id', csrf, async (req, res) => {
    res.json(await service.update(parse(id, req.params.id), parse(editOrder, req.body)));
  });
  for (const [path, next] of [['enviar', 'ENVIADO'], ['cancelar', 'CANCELADO']] as const) {
    router.post('/:id/' + path, csrf, async (req, res) => {
      parse(createAction, req.body ?? {});
      res.json(await service.transition(parse(id, req.params.id), next));
    });
  }
  router.get('/:id/itens', async (req, res) => { res.json(await service.items(parse(id, req.params.id))); });
  router.post('/:id/itens', csrf, async (req, res) => {
    res.status(201).json(await service.add(parse(id, req.params.id), parse(item, req.body)));
  });
  router.patch('/:id/itens/:idProduto', csrf, async (req, res) => {
    res.json(await service.edit(parse(id, req.params.id), parse(id, req.params.idProduto), parse(editItem, req.body)));
  });
  return router;
}

const createAction = z.object({}).strict();
