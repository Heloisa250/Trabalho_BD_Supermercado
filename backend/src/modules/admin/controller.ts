import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { id, list, officialCreates, schemas, status } from './schemas.js';
import { AdminError, type Fields, type Resource } from './repository.js';
import type { AdminService } from './service.js';

export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join('.')).filter(Boolean);
    throw new AdminError(400, 'INVALID_INPUT', fields.length
      ? 'Verifique os campos: ' + [...new Set(fields)].join(', ') + '.'
      : 'Dados inválidos ou campos não permitidos.');
  }
  return result.data;
}

export function adminController(service: AdminService, resource: Resource, official = false) {
  const config = schemas[resource];
  const createSchema = official && resource in officialCreates ? officialCreates[resource as keyof typeof officialCreates] : config.create;
  const getAll: RequestHandler = async (req, res) => { res.json(await service.list(parse(list, req.query))); };
  const getOne: RequestHandler = async (req, res) => { res.json(await service.detail(parse(id, req.params.id))); };
  const create: RequestHandler = async (req, res) => {
    res.status(201).json(await service.create(parse(createSchema as z.ZodType<Fields>, req.body)));
  };
  const update: RequestHandler = async (req, res) => {
    const fields = parse(config.edit as z.ZodType<Fields>, req.body);
    if (!Object.keys(fields).length) throw new AdminError(400, 'INVALID_INPUT', 'Informe ao menos um campo.');
    res.json(await service.update(parse(id, req.params.id), fields));
  };
  const changeStatus: RequestHandler = async (req, res) => {
    res.json(await service.update(parse(id, req.params.id), parse(status, req.body)));
  };
  return { getAll, getOne, create, update, changeStatus };
}
