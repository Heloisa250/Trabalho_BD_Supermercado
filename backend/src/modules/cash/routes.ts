import type { PublicEmployee } from '../auth/service.js';
import { Router, type RequestHandler } from 'express';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { nextExplicitId, transaction } from '../../config/mysql-transaction.js';
import { sqlBusinessDate } from '../../config/business-time.js';
import { parse } from '../admin/controller.js';
import { AdminError } from '../admin/error.js';
import { id, money } from '../admin/schemas.js';
import { CASH_FORM_SQL, cashConference, type SalePayment } from './conference.js';

const opening = z.object({ id_caixa: z.number().int().min(1).max(2147483647), fundo_troco: money }).strict();
const closing = z.object({ valor_contado: money }).strict();
const filters = z.object({
  numero: id.optional(), caixa: id.optional(), operador: id.optional(),
  situacao: z.enum(['ABERTA','FECHADA']).optional(), inicio: z.iso.date().optional(), fim: z.iso.date().optional(),
  pagina: z.coerce.number().int().min(1).max(100000).default(1),
  ordem: z.enum(['asc','desc']).default('desc'),
}).strict().refine(value => !value.inicio || !value.fim || value.inicio <= value.fim);

const select = `SELECT s.*,c.numero,f.nome AS operador,
  IF(s.data_fechamento IS NULL,'ABERTA','FECHADA') AS situacao
  FROM sessao_caixa s JOIN caixa c USING(id_caixa) JOIN funcionario f ON f.id_funcionario=s.id_operador`;
type Connection = Pool | PoolConnection;
type SqlValue = string | number;
async function rows<T extends RowDataPacket = RowDataPacket>(conn: Connection, sql: string, args: SqlValue[]) {
  const [result] = await conn.execute<T[]>(sql,args);
  return result;
}

// Futuros escritores de venda devem chamar este guard dentro da própria transação.
export async function lockOperatorSession(conn: PoolConnection, key: number, operator: number, terminal?: number) {
  const [session] = await rows(conn, 'SELECT * FROM sessao_caixa WHERE id_sessao=? FOR UPDATE', [key]);
  if (!session) throw new AdminError(404,'NOT_FOUND','Sessão não encontrada.');
  if (session.id_operador !== operator || (terminal !== undefined && session.id_caixa !== terminal)) {
    throw new AdminError(403,'FORBIDDEN','Sessão de outro operador ou terminal.');
  }
  if (session.data_fechamento !== null) throw new AdminError(409,'SESSION_CLOSED','A sessão já está fechada.');
  return session;
}

async function detail(conn: Connection, key: number, operator: number, admin: boolean) {
  const [session] = await rows(conn, select + ' WHERE s.id_sessao=?', [key]);
  if (!session) throw new AdminError(404,'NOT_FOUND','Sessão não encontrada.');
  if (!admin && session.id_operador !== operator) throw new AdminError(403,'FORBIDDEN','Sessão de outro operador.');
  const sales = await rows<RowDataPacket & SalePayment>(conn, `SELECT v.id_venda,v.status,v.valor_total,p.id_pagamento,p.valor,p.valor_recebido,p.troco,
    ${CASH_FORM_SQL} AS dinheiro
    FROM venda v LEFT JOIN pagamento p USING(id_venda) LEFT JOIN forma_pagamento fp USING(id_forma_pagamento)
    WHERE v.id_sessao=? ORDER BY v.id_venda,p.id_pagamento`, [key]);
  return { ...session, ...cashConference(session.fundo_troco,session.valor_contado,sales) };
}

export function cashRoutes(pool: Pool | undefined, csrf: RequestHandler, isAdmin: (employee: Pick<PublicEmployee, 'matricula' | 'grupo'>) => boolean) {
  const router = Router();
  router.use((_req,res,next) => { res.set('Cache-Control','no-store'); next(); });
  function db() {
    if (!pool) throw new AdminError(503,'DATABASE_UNAVAILABLE','Banco indisponível.');
    return pool;
  }
  router.get('/', async (req,res) => {
    const query = parse(filters,req.query);
    const employee = res.locals.employee;
    const admin = isAdmin(employee);
    if (!admin && query.operador !== undefined && query.operador !== employee.id) {
      throw new AdminError(403,'FORBIDDEN','Consulta de outro operador não autorizada.');
    }
    const where: string[] = [];
    const args: SqlValue[] = [];
    for (const [column,value] of [['s.id_sessao',query.numero],['s.id_caixa',query.caixa],
      ['s.id_operador',admin ? query.operador : employee.id],['s.data_abertura>=',query.inicio],
      ['s.data_abertura<=',query.fim && query.fim + ' 23:59:59']] as const) {
      if (value === undefined) continue;
      where.push(column + (column.endsWith('=') ? '?' : '=?'));
      args.push(value);
    }
    if (query.situacao) where.push('s.data_fechamento IS ' + (query.situacao === 'ABERTA' ? 'NULL' : 'NOT NULL'));
    const order = query.ordem === 'asc' ? ' ASC' : ' DESC';
    const result = await rows(db(),select + (where.length ? ' WHERE ' + where.join(' AND ') : '') +
      ' ORDER BY s.data_abertura' + order + ',s.id_sessao' + order + ' LIMIT 21 OFFSET ?', [...args,(query.pagina-1)*20]);
    res.json({ items: result.slice(0,20), pagina: query.pagina, mais: result.length > 20 });
  });
  router.get('/terminais', async (_req,res) => {
    res.json(await rows(db(),`SELECT c.id_caixa,c.numero,c.descricao,
      c.ativo=1 AND NOT EXISTS (SELECT 1 FROM sessao_caixa s WHERE s.id_caixa=c.id_caixa AND s.data_fechamento IS NULL) AS disponivel
      FROM caixa c ORDER BY c.numero`, []));
  });
  router.get('/ativa', async (_req,res) => {
    const employee = res.locals.employee.id;
    const [active] = await rows(db(),'SELECT id_sessao FROM sessao_caixa WHERE id_operador=? AND data_fechamento IS NULL ORDER BY id_sessao LIMIT 1',[employee]);
    res.json(active ? await detail(db(),active.id_sessao,employee,false) : null);
  });
  router.get('/:id', async (req,res) => {
    const employee = res.locals.employee;
    res.json(await detail(db(),parse(id,req.params.id),employee.id,isAdmin(employee)));
  });
  router.post('/abrir',csrf,async (req,res) => {
    const input = parse(opening,req.body);
    const operator = res.locals.employee.id;
    const saved = await transaction(db(),async conn => {
      const [employee] = await rows(conn,`SELECT id_funcionario FROM funcionario WHERE id_funcionario=? AND ativo=1
        AND (data_demissao IS NULL OR data_demissao>${sqlBusinessDate()}) FOR UPDATE`,[operator]);
      if (!employee) throw new AdminError(403,'INACTIVE_OPERATOR','Operador indisponível.');
      const [terminal] = await rows(conn,'SELECT ativo FROM caixa WHERE id_caixa=? FOR UPDATE',[input.id_caixa]);
      if (!terminal) throw new AdminError(404,'NOT_FOUND','Terminal não encontrado.');
      if (terminal.ativo !== 1) throw new AdminError(409,'INACTIVE_TERMINAL','Terminal inativo.');
      const conflicts = await rows(conn,`SELECT id_caixa FROM sessao_caixa WHERE data_fechamento IS NULL
        AND (id_caixa=? OR id_operador=?) FOR UPDATE`,[input.id_caixa,operator]);
      if (conflicts.some(row => row.id_caixa === input.id_caixa)) throw new AdminError(409,'TERMINAL_BUSY','O terminal já tem uma sessão aberta.');
      if (conflicts.length) throw new AdminError(409,'OPERATOR_BUSY','Você já tem uma sessão aberta.');
      const key = await nextExplicitId(conn,'sessao_caixa','id_sessao');
      await conn.execute(`INSERT INTO sessao_caixa (id_sessao,id_caixa,id_operador,data_abertura,data_fechamento,fundo_troco,valor_contado)
        VALUES (?,?,?,CURRENT_TIMESTAMP,NULL,?,NULL)`,[key,input.id_caixa,operator,input.fundo_troco]);
      return detail(conn,key,operator,false);
    },'sqlider:Supermercado:sessao_caixa');
    res.status(201).json(saved);
  });
  router.post('/:id/fechar',csrf,async (req,res) => {
    const key = parse(id,req.params.id);
    const input = parse(closing,req.body);
    const operator = res.locals.employee.id;
    res.json(await transaction(db(),async conn => {
      await lockOperatorSession(conn,key,operator);
      const current = await detail(conn,key,operator,false);
      if (current.vendas_abertas) throw new AdminError(409,'OPEN_SALES','Encerre as vendas abertas antes de fechar o caixa.');
      if (current.vendas_pendentes || current.divergencias.length) {
        throw new AdminError(409,'PENDING_PAYMENTS','Existem pagamentos pendentes ou divergentes nesta sessão.');
      }
      await conn.execute('UPDATE sessao_caixa SET data_fechamento=CURRENT_TIMESTAMP,valor_contado=? WHERE id_sessao=?',[input.valor_contado,key]);
      return detail(conn,key,operator,false);
    }));
  });
  return router;
}
