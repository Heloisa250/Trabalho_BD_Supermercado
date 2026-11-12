import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import type { Pool } from 'mysql2/promise';
import { createApp } from '../src/app.js';
import { authService } from '../src/modules/auth/service.js';
import type { Employee } from '../src/modules/auth/repository.js';

test('catálogo: contratos HTTP e parâmetros SQL com pool isolado', async (context) => {
  const origin = 'http://127.0.0.1:5175';
  const secret = 'catalog-test-only-secret-32-characters';
  const auth = authService({ byMatricula: async () => undefined,
    byId: async (id) => ({ id, matricula: id === 1 ? 'ADMIN' : 'OPERADOR', podeCancelar: 1 }) as Employee }, secret, 300, true);
  const calls: { sql: string; values: unknown[] }[] = [];
  let error: string | undefined;
  async function execute(sql: string, values: unknown[] = []) {
    calls.push({ sql, values });
    if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
    if (sql.includes('RELEASE_LOCK')) return [[{ released: 1 }]];
    if (sql.includes('MAX(')) return [[{ maxId: 0 }]];
    if (sql.startsWith('INSERT') && error) throw Object.assign(new Error(), { code: error });
    if (sql.startsWith('INSERT') || sql.startsWith('UPDATE')) return [{ insertId: 1, affectedRows: 1 }];
    if (sql.includes('FROM categoria ORDER BY')) return [[
      { id_categoria: 1, id_categoria_pai: null }, { id_categoria: 2, id_categoria_pai: 1 },
    ]];
    return [[{ id: 1, preco_venda: '99999999.99', preco_custo: '12.30' }]];
  }
  const database = { execute, getConnection: async () => ({
    execute, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
  }) } as unknown as Pool;
  const server = createApp({ corsOrigin: origin, checkDatabase: async () => {}, database, admins: ['ADMIN'], official: true,
    auth: { service: auth, secure: false, ttl: 300 } }).listen(0, '127.0.0.1');
  context.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = 'http://127.0.0.1:' + address.port + '/api/v1/';
  const cookie = (id: number) => 'sqlider_official_session=' + jwt.sign({}, secret, {
    subject: String(id), issuer: 'supermercado-qualidade-lider', audience: 'funcionario-oficial', expiresIn: 300,
  });
  async function send(path: string, status: number, method = 'GET', body?: object, session = cookie(1), source = origin) {
    const result = await fetch(base + path, { method, headers: { Cookie: session, Origin: source, 'Content-Type': 'application/json' },
      body: body && JSON.stringify(body) });
    assert.equal(result.status, status, path);
    return result.json();
  }

  await send('produtos', 401, 'GET', undefined, '');
  await send('produtos', 403, 'GET', undefined, cookie(2));
  await send('categorias', 403, 'POST', { nome: 'A' }, cookie(1), 'https://externo.invalid');
  await send('categorias', 201, 'POST', { nome: 'Filha', id_categoria_pai: 1 });
  await send('categorias/2', 200, 'PATCH', { id_categoria_pai: 1, nome: 'Editada' });
  await send('categorias/1', 409, 'PATCH', { id_categoria_pai: 2 });
  await send('categorias/1', 409, 'PATCH', { id_categoria_pai: 1 });
  await send('categorias/2', 409, 'PATCH', { id_categoria_pai: 99 });

  const product = { codigo_barras: '00012A', nome: 'Produto', id_categoria: 1, id_marca: 1,
    unidade_medida: 'KG', preco_venda: '99999999.99', estoque_minimo: '1.025', estoque_maximo: '10.000', ativo: true };
  await send('marcas', 201, 'POST', { nome: 'Marca', fabricante: 'Fábrica' });
  await send('marcas/1', 200, 'PATCH', { fabricante: 'Outra' });
  await send('marcas?busca=Marca&fabricante=Outra', 200);
  await send('produtos', 400, 'POST', { ...product, unidade_medida: 'G' });
  await send('produtos', 400, 'POST', { ...product, preco_venda: '1.001' });
  await send('produtos', 400, 'POST', { ...product, quantidade_estoque: 2 });
  assert.equal((await send('produtos', 201, 'POST', product)).preco_venda, '99999999.99');
  assert.ok(calls.some(({ values }) => values.includes('00012A') && values.includes('1.025')));
  await send('produtos/1', 200, 'PATCH', { id_marca: null });
  await send('produtos/1/status', 200, 'PATCH', { ativo: false });
  const attack = "' OR 1=1 --";
  await send('produtos?busca=' + encodeURIComponent(attack) + '&marca=1&categoria=1&ativo=true&ordem=preco_venda&direcao=desc&pagina=2&limite=10', 200);
  assert.ok(!calls.at(-1)!.sql.includes(attack));
  assert.deepEqual(calls.at(-1)!.values, [attack, attack, 1, 1, 1, 11, 10]);
  assert.match(calls.at(-1)!.sql, /ORDER BY t.preco_venda DESC/);
  await send('produtos?ordem=' + encodeURIComponent(attack), 400);

  const supplier = { razao_social: 'Fornecedor', cnpj: '04.252.011/0001-10', ativo: true };
  await send('fornecedores', 400, 'POST', { ...supplier, cnpj: '00000000000000' });
  await send('fornecedores', 201, 'POST', supplier);
  assert.ok(calls.some(({ values }) => values.includes('04252011000110')));
  await send('fornecedores/1', 200, 'PATCH', { nome_fantasia: 'Teste' });
  await send('fornecedores/1/status', 200, 'PATCH', { ativo: false });
  await send('fornecedores?busca=04.252.011%2F0001-10&ativo=false', 200);
  assert.equal(calls.at(-1)!.values[2], '04252011000110');

  const link = { id_fornecedor: 1, preco_custo: '12.30', prazo_entrega_dias: 5 };
  await send('produtos/1/fornecedores', 201, 'POST', link);
  await send('produtos/1/fornecedores', 200);
  await send('produtos/1/fornecedores/1', 200, 'PATCH', { prazo_entrega_dias: null, preco_custo: '13.05' });
  const update = calls.find(({ sql }) => sql.startsWith('UPDATE produto_fornecedor'))!;
  assert.match(update.sql, /WHERE id_produto=\? AND id_fornecedor=\?/);
  assert.deepEqual(update.values.slice(-2), [1, 1]);
  await send('produtos/1/fornecedores/1', 400, 'PATCH', { id_fornecedor: 2 });

  await send('categorias', 201, 'POST', { nome: 'Filha' });
  await send('marcas', 201, 'POST', { nome: 'Marca' });
  error = 'ER_DUP_ENTRY';
  for (const [path, body] of [['produtos', product], ['fornecedores', supplier], ['produtos/1/fornecedores', link]] as const) {
    await send(path, 409, 'POST', body);
  }
  error = 'ER_NO_REFERENCED_ROW_2';
  await send('categorias', 409, 'POST', { nome: 'Órfã', id_categoria_pai: 99 });
  await send('produtos', 409, 'POST', { ...product, id_categoria: 99 });
  await send('produtos', 409, 'POST', { ...product, id_marca: 99 });
  await send('produtos/99/fornecedores', 409, 'POST', link);
  await send('produtos/1/fornecedores', 409, 'POST', { ...link, id_fornecedor: 99 });
});
