import { Router, type ErrorRequestHandler, type RequestHandler } from 'express';
import type { Pool } from 'mysql2/promise';
import { requireSession, requireTrustedOrigin } from '../auth/middleware.js';
import { AuthDatabaseError, type AuthService } from '../auth/service.js';
import { adminController } from './controller.js';
import { adminRepository, AdminError, type Resource } from './repository.js';
import { purchaseRoutes } from '../purchases/routes.js';
import { MysqlIdLimit, MysqlLockTimeout } from '../../config/mysql-transaction.js';
import { mountProductSuppliers } from './productSuppliers.js';
import { adminService } from './service.js';
import { stockRoutes } from '../stock/routes.js';
import { cashRoutes } from '../cash/routes.js';
import { salesRoutes } from '../sales/routes.js';
import { dashboardRoutes } from '../dashboard/routes.js';

export function canAdminister(matricula: string, admins: readonly string[]) {
  return admins.includes(matricula);
}

export const adminErrors: ErrorRequestHandler = (error, _req, res, next) => {
  let failure = error instanceof AdminError ? error : undefined;
  if (error instanceof MysqlIdLimit) {
    failure = new AdminError(409, 'ID_LIMIT', 'Limite de identificadores atingido.');
  } else if (error instanceof MysqlLockTimeout) {
    failure = new AdminError(409, 'CONCURRENT_UPDATE', 'Outro cadastro está em andamento. Tente novamente.');
  } else if (error instanceof AuthDatabaseError || ['ECONNREFUSED', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST', 'ER_CON_COUNT_ERROR'].includes(error?.code)) {
    failure = new AdminError(503, 'DATABASE_UNAVAILABLE', 'Banco indisponível. Tente novamente.');
  } else if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error?.code)) {
    failure = new AdminError(409, 'CONCURRENT_UPDATE', 'Outra operação está atualizando os dados. Tente novamente.');
  } else if (error?.code === 'ER_DUP_ENTRY') {
    const field = String(error.sqlMessage).match(/\b(?:cpf|matricula|numero|cnpj|codigo_barras)\b|uq_\w+/)?.[0]?.replace(/^uq_[^_]+_/, '');
    failure = new AdminError(409, 'DUPLICATE', field ? 'Já existe um registro com esse valor em ' + field + '.' : 'Registro duplicado.');
  } else if (error?.code === 'ER_NO_REFERENCED_ROW_2') {
    failure = new AdminError(409, 'INVALID_REFERENCE', 'Um dos registros relacionados não existe.');
  } else if (['ER_TABLEACCESS_DENIED_ERROR', 'ER_COLUMNACCESS_DENIED_ERROR'].includes(error?.code)) {
    failure = new AdminError(503, 'DATABASE_WRITE_UNAVAILABLE', 'A operação está indisponível por configuração do banco.');
  }
  if (!failure) { next(error); return; }
  res.status(failure.status).json({ error: { code: failure.code, message: failure.message } });
};

export function adminRoutes(auth: AuthService, pool: Pool | undefined, admins: readonly string[], origins: readonly string[], official = false) {
  const router = Router();
  const session = requireSession(auth);
  const csrf = requireTrustedOrigin(origins);
  const access: RequestHandler = (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ autorizado: canAdminister(res.locals.employee.matricula, admins) });
  };
  router.get('/admin/access', session, access, adminErrors);
  const requireAdmin: RequestHandler = (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!canAdminister(res.locals.employee.matricula, admins)) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Acesso administrativo não autorizado.' } });
      return;
    }
    next();
  };
  if (official) router.use(stockRoutes(pool, session, requireAdmin, csrf), adminErrors);
  if (official) router.use('/sessoes-caixa', session, cashRoutes(pool, csrf, matricula => canAdminister(matricula,admins)), adminErrors);
  if (official) router.use('/vendas', session, salesRoutes(pool, auth, csrf), adminErrors);
  // Script 10: relatórios somente leitura, restritos à lista administrativa (ADMIN_MATRICULAS).
  if (official) router.use('/dashboard', session, requireAdmin, dashboardRoutes(pool), adminErrors);
  router.use('/pedidos-compra', session, requireAdmin, purchaseRoutes(pool, csrf, official), adminErrors);
  const resources: Resource[] = ['funcionarios', 'cargos', 'caixas', 'formas-pagamento', 'categorias', 'marcas', 'produtos', 'fornecedores'];
  for (const resource of resources) {
    const controller = adminController(adminService(adminRepository(pool, resource, official), resource, admins), resource, official);
    const module = Router();
    module.use(session, requireAdmin);
    module.get('/', controller.getAll);
    module.get('/:id', controller.getOne);
    module.post('/', csrf, controller.create);
    module.patch('/:id', csrf, controller.update);
    if (resource === 'produtos') mountProductSuppliers(module, pool, csrf);
    if (['funcionarios', 'caixas', 'formas-pagamento', 'produtos', 'fornecedores'].includes(resource)) module.patch('/:id/status', csrf, controller.changeStatus);
    module.use(adminErrors);
    router.use('/' + resource, module);
  }
  return router;
}
