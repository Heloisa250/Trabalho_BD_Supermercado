import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { nextExplicitId, transaction } from '../../config/mysql-transaction.js';
import { AdminError } from './error.js';
import type { z } from 'zod';
import type { list, schemas } from './schemas.js';

export type Resource = keyof typeof schemas;
export type Filters = z.infer<typeof list>;
export type Fields = Record<string, string | number | boolean | null>;

const resources = {
  categorias: { table: 'categoria', key: 'id_categoria', list: 't.id_categoria AS id,t.id_categoria_pai,t.nome,t.descricao,p.nome AS pai', from: 'categoria t LEFT JOIN categoria p ON p.id_categoria=t.id_categoria_pai' },
  marcas: { table: 'marca', key: 'id_marca', list: 't.id_marca AS id,t.nome,t.fabricante', from: 'marca t' },
  produtos: { table: 'produto', key: 'id_produto', list: 't.id_produto AS id,t.codigo_barras,t.nome,t.descricao,t.id_categoria,t.id_marca,t.unidade_medida,t.preco_venda,t.estoque_minimo,t.estoque_maximo,t.ativo,c.nome AS categoria,m.nome AS marca', from: 'produto t JOIN categoria c ON c.id_categoria=t.id_categoria LEFT JOIN marca m ON m.id_marca=t.id_marca' },
  fornecedores: { table: 'fornecedor', key: 'id_fornecedor', list: 't.id_fornecedor AS id,t.razao_social,t.nome_fantasia,t.cnpj,t.telefone,t.email,t.endereco,t.ativo', from: 'fornecedor t' },
  funcionarios: {
    table: 'funcionario', key: 'id_funcionario',
    list: 't.id_funcionario AS id,t.nome,t.matricula,t.id_cargo,c.nome AS cargo,t.ativo',
    details: 't.cpf,t.email,t.telefone,t.salario,t.data_admissao,t.data_demissao',
    from: 'funcionario t JOIN cargo c ON c.id_cargo=t.id_cargo',
  },
  cargos: { table: 'cargo', key: 'id_cargo', list: 't.id_cargo AS id,t.nome,t.descricao,t.pode_cancelar_item', from: 'cargo t' },
  caixas: { table: 'caixa', key: 'id_caixa', list: 't.id_caixa AS id,t.numero,t.descricao,t.ativo', from: 'caixa t' },
  'formas-pagamento': { table: 'forma_pagamento', key: 'id_forma_pagamento', list: 't.id_forma_pagamento AS id,t.descricao,t.permite_troco,t.ativo', from: 'forma_pagamento t' },
} as const;

export { AdminError } from './error.js';

export function checkParent(tree: readonly { id_categoria: number; id_categoria_pai: number | null }[], id: number | undefined, parent: number) {
  const nodes = new Map(tree.map((row) => [row.id_categoria, row.id_categoria_pai]));
  if (id !== undefined && !nodes.has(id)) throw new AdminError(404, 'NOT_FOUND', 'Categoria não encontrada.');
  const seen = new Set(id === undefined ? [] : [id]);
  let current: number | null = parent;
  while (current !== null) {
    if (seen.has(current)) throw new AdminError(409, 'CATEGORY_CYCLE', 'A categoria pai criaria um ciclo.');
    seen.add(current);
    const next = nodes.get(current);
    if (next === undefined) throw new AdminError(409, 'INVALID_REFERENCE', 'Categoria pai não encontrada.');
    current = next;
  }
}

export function adminRepository(pool: Pool | undefined, resource: Resource, official = false) {
  const spec = resources[resource];
  const uniqueField = official && resource === 'cargos' ? 'nome'
    : official && resource === 'formas-pagamento' ? 'descricao' : undefined;
  const explicitId = official && (resource === 'funcionarios' || resource === 'produtos' || resource === 'fornecedores');
  const lock = explicitId || uniqueField ? 'sqlider:Supermercado:' + spec.table : undefined;

  async function checkUnique(connection: PoolConnection, fields: Fields, id?: number) {
    if (!uniqueField || !(uniqueField in fields)) return;
    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT ${spec.key} FROM ${spec.table} WHERE ${uniqueField}=?` +
      (id === undefined ? '' : ` AND ${spec.key}<>?`) + ' LIMIT 1',
      id === undefined ? [fields[uniqueField]] : [fields[uniqueField], id]);
    if (rows.length) throw new AdminError(409, 'DUPLICATE', 'Já existe um registro com esse valor em ' + uniqueField + '.');
  }

  async function insert(connection: Pool | PoolConnection, fields: Fields) {
    // Colunas vêm dos schemas estritos e, no oficial, do alocador interno.
    const columns = Object.keys(fields);
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO ${spec.table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
      Object.values(fields));
    return result;
  }

  async function validateParent(connection: PoolConnection, parent: Fields[string], id?: number) {
    if (resource !== 'categorias' || typeof parent !== 'number') return;
    const [tree] = await connection.execute<(RowDataPacket & { id_categoria: number; id_categoria_pai: number | null })[]>(
      'SELECT id_categoria, id_categoria_pai FROM categoria ORDER BY id_categoria FOR UPDATE');
    checkParent(tree, id, parent);
  }

  function db() {
    if (!pool) throw new AdminError(503, 'DATABASE_UNAVAILABLE', 'Banco indisponível.');
    return pool;
  }

  async function detail(id: number, connection: Pool | PoolConnection = db()) {
    const columns = 'details' in spec ? spec.list + ',' + spec.details : spec.list;
    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT ${columns} FROM ${spec.from} WHERE t.${spec.key}=?`, [id]);
    return rows[0];
  }

  return {
    detail,
    async list(filters: Filters) {
      const predicates: string[] = [];
      const values: (number | string)[] = [];
      if (resource === 'funcionarios') {
        if (filters.busca) {
          predicates.push('(LOCATE(?,t.nome)>0 OR LOCATE(?,t.matricula)>0)');
          values.push(filters.busca, filters.busca);
        }
        if (filters.cargo !== undefined) { predicates.push('t.id_cargo=?'); values.push(filters.cargo); }
        if (filters.ativo !== undefined) { predicates.push('t.ativo=?'); values.push(Number(filters.ativo === 'true')); }
      }
      const searchColumns = {
        categorias: ['t.nome'], marcas: ['t.nome'], produtos: ['t.nome', 't.codigo_barras'],
        fornecedores: ['t.razao_social', 't.nome_fantasia', 't.cnpj'],
      };
      if (filters.busca && resource in searchColumns) {
        const columns = searchColumns[resource as keyof typeof searchColumns];
        predicates.push('(' + columns.map((column) => 'LOCATE(?,' + column + ')>0').join(' OR ') + ')');
        values.push(...columns.map((column) => column === 't.cnpj' && /^[\d.\/-]+$/.test(filters.busca!)
          ? filters.busca!.replace(/\D/g, '') : filters.busca!));
      }
      if (resource === 'marcas' && filters.fabricante) {
        predicates.push('LOCATE(?,t.fabricante)>0'); values.push(filters.fabricante);
      }
      if (resource === 'produtos') {
        if (filters.categoria) { predicates.push('t.id_categoria=?'); values.push(filters.categoria); }
        if (filters.marca) { predicates.push('t.id_marca=?'); values.push(filters.marca); }
        if (filters.fornecedor) {
          predicates.push('EXISTS (SELECT 1 FROM produto_fornecedor pf WHERE pf.id_produto=t.id_produto AND pf.id_fornecedor=?)');
          values.push(filters.fornecedor);
        }
      }
      if ((resource === 'produtos' || resource === 'fornecedores') && filters.ativo !== undefined) {
        predicates.push('t.ativo=?'); values.push(Number(filters.ativo === 'true'));
      }
      const sort = { nome: 't.nome', codigo_barras: 't.codigo_barras', preco_venda: 't.preco_venda', id: 't.id_produto' };
      const order = resource === 'produtos' ? sort[filters.ordem] + (filters.direcao === 'desc' ? ' DESC' : ' ASC') + ', t.id_produto' : 't.' + spec.key;
      const where = predicates.length ? ' WHERE ' + predicates.join(' AND ') : '';
      const [items] = await db().execute<RowDataPacket[]>(
        `SELECT ${spec.list} FROM ${spec.from}${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
        [...values, filters.limite + 1, (filters.pagina - 1) * filters.limite]);
      return { items: items.slice(0, filters.limite), pagina: filters.pagina, mais: items.length > filters.limite };
    },
    async create(fields: Fields) {
      if (!lock && !(official && resource === 'categorias' && typeof fields.id_categoria_pai === 'number')) {
        const result = await insert(db(), fields);
        return detail(result.insertId);
      }
      return transaction(db(), async (connection) => {
        await validateParent(connection, fields.id_categoria_pai);
        await checkUnique(connection, fields);
        if (explicitId && resource === 'funcionarios') {
          const [cargos] = await connection.execute<RowDataPacket[]>(
            'SELECT id_cargo FROM cargo WHERE id_cargo=? FOR SHARE', [fields.id_cargo]);
          if (!cargos.length) throw new AdminError(409, 'INVALID_REFERENCE', 'O cargo informado não existe.');
        }
        if (explicitId) {
          const id = await nextExplicitId(connection, spec.table, spec.key);
          await insert(connection, { ...fields, [spec.key]: id });
          return detail(id, connection);
        }
        const result = await insert(connection, fields);
        return detail(result.insertId, connection);
      }, lock);
    },
    async update(id: number, fields: Fields, validate: (current: RowDataPacket) => void) {
      return transaction(db(), async (connection) => {
        await validateParent(connection, fields.id_categoria_pai, id);
        const [locked] = await connection.execute<RowDataPacket[]>(
          `SELECT ${spec.key} FROM ${spec.table} WHERE ${spec.key}=? FOR UPDATE`, [id]);
        if (!locked.length) throw new AdminError(404, 'NOT_FOUND', 'Registro não encontrado.');
        const current = await detail(id, connection);
        validate(current);
        await checkUnique(connection, fields, id);
        if (resource === 'caixas' && fields.ativo === false) {
          const [sessions] = await connection.execute<RowDataPacket[]>(
            'SELECT id_sessao FROM sessao_caixa WHERE id_caixa=? AND data_fechamento IS NULL LIMIT 1', [id]);
          if (sessions.length) throw new AdminError(409, 'OPEN_SESSION', 'Este caixa possui uma sessão aberta.');
        }
        const set = Object.keys(fields).map((key) => key + '=?').join(',');
        await connection.execute(`UPDATE ${spec.table} SET ${set} WHERE ${spec.key}=?`, [...Object.values(fields), id]);
        return detail(id, connection);
      }, uniqueField && uniqueField in fields ? lock : undefined);
    },
  };
}

export type AdminRepository = ReturnType<typeof adminRepository>;
