import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool } from 'mysql2/promise';
import { adminRepository, checkParent } from '../src/modules/admin/repository.js';
import { adminService } from '../src/modules/admin/service.js';
import { officialCreates, officialProductEdit, schemas } from '../src/modules/admin/schemas.js';
import { MysqlIdLimit, MysqlLockTimeout } from '../src/config/mysql-transaction.js';

test('R04 usa o alocador concorrente para produto e fornecedor', async () => {
  for (const [resource, table] of [['produtos', 'produto'], ['fornecedores', 'fornecedor']] as const) {
    let maxId = 10;
    let tail = Promise.resolve();
    const pool = { async getConnection() {
      let unlock: () => void;
      let pending: number;
      return {
        async execute(sql: string, values: unknown[] = []) {
          if (sql.includes('GET_LOCK')) {
            assert.deepEqual(values, ['sqlider:Supermercado:' + table]);
            const previous = tail;
            tail = new Promise<void>((resolve) => { unlock = resolve; });
            await previous;
            return [[{ acquired: 1 }]];
          }
          if (sql.includes('RELEASE_LOCK')) { unlock(); return [[{ released: 1 }]]; }
          if (sql.includes('MAX(id_' + table + ')')) return [[{ maxId }]];
          if (sql.startsWith('INSERT INTO ' + table)) {
            assert.match(sql, new RegExp('id_' + table));
            pending = Number(values.at(-1));
            return [{ insertId: 0 }];
          }
          return [[{ id: values[0] }]];
        },
        async beginTransaction() {},
        async commit() { maxId = pending; },
        release() {},
      };
    } } as unknown as Pool;
    const repository = adminRepository(pool, resource, true);
    const results = await Promise.all([repository.create({ ativo: true }), repository.create({ ativo: false })]);
    assert.deepEqual(results.map(({ id }) => id), [11, 12]);
  }
});

test('R04 valida o contrato oficial e preserva edição parcial de fornecedor importado', () => {
  const product = {
    codigo_barras: '001234', nome: 'Produto QA', id_categoria: 1, unidade_medida: 'KG',
    preco_venda: '99999999.99', estoque_minimo: '0.001', estoque_maximo: '9999999.999', ativo: false,
  };
  assert.deepEqual(officialCreates.produtos.parse(product), product);
  for (const field of ['unidade_medida', 'estoque_minimo', 'estoque_maximo', 'ativo'] as const) {
    assert.equal(officialCreates.produtos.safeParse({ ...product, [field]: undefined }).success, false);
  }
  for (const changes of [{ unidade_medida: 'CX' }, { preco_venda: '1.001' }, { estoque_maximo: '10000000' }, { id_produto: 42 }]) {
    assert.equal(officialCreates.produtos.safeParse({ ...product, ...changes }).success, false);
  }
  assert.equal(officialProductEdit.safeParse({ unidade_medida: 'PCT' }).success, false);
  const supplier = { razao_social: 'Fornecedor QA', cnpj: '04.252.011/0001-10', ativo: false };
  assert.equal(officialCreates.fornecedores.parse(supplier).cnpj, '04252011000110');
  assert.equal(officialCreates.fornecedores.safeParse({ ...supplier, ativo: undefined }).success, false);
  assert.equal(schemas.fornecedores.edit.safeParse({ cnpj: '00000000000000' }).success, false);
  assert.equal(schemas.fornecedores.edit.safeParse({ razao_social: 'Nome atualizado' }).success, true);
  const tree = [{ id_categoria: 1, id_categoria_pai: null }, { id_categoria: 2, id_categoria_pai: 1 }];
  assert.doesNotThrow(() => checkParent(tree, undefined, 2));
  assert.throws(() => checkParent(tree, undefined, 9), { code: 'INVALID_REFERENCE' });
  assert.throws(() => checkParent(tree, 1, 2), { code: 'CATEGORY_CYCLE' });
});

test('R03 aloca IDs na conexão bloqueada e libera após commit ou rollback', async () => {
  let maxId = 5;
  let tail = Promise.resolve();
  let timeout = false;
  let fail = false;
  let missingCargo = false;
  const events: string[] = [];
  const pool = { getConnection: async () => {
    let unlock: () => void;
    let inserted: number | undefined;
    return {
      async execute(sql: string, values: unknown[] = []) {
        if (sql.includes('GET_LOCK')) {
          assert.equal(values[0], 'sqlider:Supermercado:funcionario');
          if (timeout) return [[{ acquired: 0 }]];
          const previous = tail;
          tail = new Promise<void>((resolve) => { unlock = resolve; });
          await previous;
          events.push('lock');
          return [[{ acquired: 1 }]];
        }
        if (sql.includes('RELEASE_LOCK')) { events.push('unlock'); unlock(); return [[{ released: 1 }]]; }
        if (sql.startsWith('SELECT id_cargo')) return [missingCargo ? [] : [{ id_cargo: 1 }]];
        if (sql.includes('MAX(id_funcionario)')) { events.push('max'); return [[{ maxId }]]; }
        if (sql.startsWith('INSERT')) {
          assert.match(sql, /id_funcionario/);
          events.push('insert');
          if (fail) throw Object.assign(new Error('duplicado'), { code: 'ER_DUP_ENTRY' });
          inserted = Number(values.at(-1));
          return [{ insertId: 0 }];
        }
        return [[{ id: values[0] }]];
      },
      async beginTransaction() { events.push('begin'); },
      async commit() { events.push('commit'); if (inserted !== undefined) maxId = inserted; },
      async rollback() { events.push('rollback'); },
      release() { events.push('release'); },
    };
  } } as unknown as Pool;

  const repository = adminRepository(pool, 'funcionarios', true);
  const creates = await Promise.all([repository.create({ id_cargo: 1, ativo: true }), repository.create({ id_cargo: 1, ativo: false })]);
  assert.deepEqual(creates.map((row) => row.id), [6, 7]);
  assert.deepEqual(events.filter((event) => event !== 'release'), Array(2).fill(['lock', 'begin', 'max', 'insert', 'commit', 'unlock']).flat());
  assert.equal(events.filter((event) => event === 'release').length, 2);
  fail = true;
  await assert.rejects(repository.create({ id_cargo: 1 }), { code: 'ER_DUP_ENTRY' });
  assert.deepEqual(events.slice(-3), ['rollback', 'unlock', 'release']);
  fail = false;
  missingCargo = true;
  await assert.rejects(repository.create({ id_cargo: 99 }), { code: 'INVALID_REFERENCE' });
  missingCargo = false;
  maxId = 2147483647;
  await assert.rejects(repository.create({ id_cargo: 1 }), MysqlIdLimit);
  timeout = true;
  await assert.rejects(repository.create({ id_cargo: 1 }), MysqlLockTimeout);
  assert.equal(events.at(-1), 'release');
});

test('R03 impede duplicidade funcional sem depender do índice do banco', async () => {
  for (const [resource, field, table] of [['cargos', 'nome', 'cargo'], ['formas-pagamento', 'descricao', 'forma_pagamento']] as const) {
    let held = false;
    let writes = 0;
    const connection = {
      async execute(sql: string, args: unknown[]) {
        if (sql.includes('GET_LOCK')) { assert.equal(args[0], 'sqlider:Supermercado:' + table); held = true; return [[{ acquired: 1 }]]; }
        if (sql.includes('RELEASE_LOCK')) { held = false; return [[{ released: 1 }]]; }
        if (sql.includes('FOR UPDATE')) return [[{}]];
        if (sql.includes('LIMIT 1')) { assert.ok(held); assert.equal(args[0], 'Duplicado'); return [[{}]]; }
        if (sql.startsWith('INSERT') || sql.startsWith('UPDATE')) writes++;
        return [[{ id: 1 }]];
      },
      async beginTransaction() {}, async rollback() {}, release() {},
    };
    const repository = adminRepository({ getConnection: async () => connection } as unknown as Pool, resource, true);
    await assert.rejects(repository.create({ [field]: 'Duplicado' }), { code: 'DUPLICATE' });
    await assert.rejects(repository.update(1, { [field]: 'Duplicado' }, () => {}), { code: 'DUPLICATE' });
    assert.equal(writes, 0);
    assert.equal(held, false);
  }
});

test('R03 aceita edição parcial de CPF legado e exige flags explícitas no cadastro oficial', async () => {
  assert.equal(schemas.funcionarios.edit.safeParse({ nome: 'Novo nome' }).success, true);
  assert.equal(schemas.funcionarios.edit.safeParse({ cpf: '12345678901' }).success, false);
  assert.equal(officialCreates.caixas.safeParse({ numero: 1 }).success, false);
  assert.equal(officialCreates.caixas.safeParse({ numero: 1, ativo: false }).success, true);
  assert.equal(officialCreates['formas-pagamento'].safeParse({ descricao: 'Teste', permite_troco: false }).success, false);
  assert.equal(officialCreates['formas-pagamento'].safeParse({ descricao: 'Teste', permite_troco: 1, ativo: true }).success, false);
  const repository = {
    update: async (_id: number, _fields: object, validate: (row: object) => void) =>
      validate({ matricula: 'F0001', cpf: '12345678901' }),
  } as unknown as ReturnType<typeof adminRepository>;
  const service = adminService(repository, 'funcionarios', ['F0001']);
  await assert.rejects(async () => service.update(1, { ativo: false }), { code: 'RESERVED_MATRICULA' });
  await assert.rejects(async () => service.update(1, { matricula: 'OUTRA' }), { code: 'RESERVED_MATRICULA' });
});
