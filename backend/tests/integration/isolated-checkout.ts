import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import bcrypt from 'bcryptjs';
import { createConnection, createPool, type Connection, type Pool, type RowDataPacket } from 'mysql2/promise';
import { createApp } from '../../src/app.js';
import { checkDatabase } from '../../src/config/database.js';
import { employeeRepository } from '../../src/modules/auth/repository.js';
import { authService } from '../../src/modules/auth/service.js';

const secret = () => randomBytes(24).toString('hex');
const runId = randomUUID();
const name = 'supermercado-qa-checkout-' + runId;
const rootPassword = secret();
const image = 'mysql:8.4.13';
const docker = (args: string[]) => execFileSync('docker', args, {
  encoding: 'utf8', env: { ...process.env, MYSQL_ROOT_PASSWORD: rootPassword }, windowsHide: true,
}).trim();

async function connect(port: number): Promise<Connection> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await createConnection({
        host: '127.0.0.1', port, user: 'root', password: rootPassword,
        connectTimeout: 1500, multipleStatements: true, dateStrings: true,
      });
    } catch (error) {
      if (attempt === 44) throw error;
      await delay(1000);
    }
  }
}

async function fixture(root: Connection, password: string, supervisorPassword: string, appPassword: string) {
  const ddl = new URL('../../../database/official/Supermercado_ddl.sql', import.meta.url);
  await root.query(readFileSync(ddl, 'utf8'));
  await root.query(`
    INSERT INTO cargo (id_cargo,nome,pode_cancelar_item) VALUES (91,'Operador QA',0),(92,'Supervisor QA',1);
    INSERT INTO caixa (id_caixa,numero,ativo) VALUES (91,91,1);
    INSERT INTO categoria (id_categoria,nome) VALUES (91,'Categoria QA');
    INSERT INTO forma_pagamento (id_forma_pagamento,descricao,permite_troco,ativo)
      VALUES (91,'Dinheiro',1,1),(92,'PIX',0,1);
    INSERT INTO produto (id_produto,codigo_barras,nome,id_categoria,unidade_medida,preco_venda,estoque_minimo,estoque_maximo,ativo)
      VALUES (91,'QA-91','Produto QA',91,'UN',43.46,0,100,1);
    INSERT INTO lote (id_lote,id_produto,codigo_lote,data_validade,data_entrada,quantidade_inicial,quantidade_atual,custo_unitario)
      VALUES (91,91,'QA-PRIMEIRO',DATE_ADD(CURRENT_DATE, INTERVAL 10 DAY),UTC_TIMESTAMP(),2,2,10),
             (92,91,'QA-SEGUNDO',DATE_ADD(CURRENT_DATE, INTERVAL 20 DAY),UTC_TIMESTAMP(),10,10,10),
             (93,91,'QA-VENCIDO',DATE_SUB(CURRENT_DATE, INTERVAL 10 DAY),UTC_TIMESTAMP(),20,20,10);
  `);
  await root.execute(`
    INSERT INTO funcionario (id_funcionario,id_cargo,nome,cpf,matricula,senha_hash,salario,data_admissao,ativo)
    VALUES (91,91,'Operador QA','00000000091','QA-OPERADOR',?,0,CURRENT_DATE,1),
           (92,92,'Supervisor QA','00000000092','QA-SUPERVISOR',?,0,CURRENT_DATE,1)
  `, [await bcrypt.hash(password, 4), await bcrypt.hash(supervisorPassword, 4)]);
  await root.query('INSERT INTO sessao_caixa (id_sessao,id_caixa,id_operador,data_abertura,fundo_troco) VALUES (91,91,91,UTC_TIMESTAMP(),0)');
  await root.query('CREATE USER ?@\'%\' IDENTIFIED BY ?', ['supermercado_r03_app', appPassword]);
  await root.query(`
    GRANT SELECT ON Supermercado.* TO 'supermercado_r03_app'@'%';
    GRANT INSERT, UPDATE ON Supermercado.venda TO 'supermercado_r03_app'@'%';
    GRANT INSERT, UPDATE ON Supermercado.item_venda TO 'supermercado_r03_app'@'%';
    GRANT UPDATE ON Supermercado.sessao_caixa TO 'supermercado_r03_app'@'%';
    GRANT UPDATE ON Supermercado.lote TO 'supermercado_r03_app'@'%';
    GRANT INSERT ON Supermercado.pagamento TO 'supermercado_r03_app'@'%';
    GRANT INSERT ON Supermercado.movimentacao_estoque TO 'supermercado_r03_app'@'%';
    GRANT INSERT ON Supermercado.cancelamento_item TO 'supermercado_r03_app'@'%';
  `);
}

async function scenarios(root: Connection, pool: Pool, password: string, supervisorPassword: string) {
  const origin = 'http://127.0.0.1';
  const service = authService(employeeRepository(pool), secret(), 120, true);
  const server = createApp({
    corsOrigin: origin, checkDatabase: () => checkDatabase(pool, 'Supermercado'),
    auth: { service, ttl: 120, secure: false }, database: pool, official: true,
  }).listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const url = `${origin}:${address.port}/api/v1`;
    let cookie = '';
    async function post(path: string, body: unknown) {
      const response = await fetch(url + path, {
        method: 'POST', headers: { 'Content-Type': 'application/json', origin, cookie },
        body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
      });
      return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie') };
    }
    const login = await post('/auth/login', { matricula: 'QA-OPERADOR', senha: password });
    assert.equal(login.status, 200);
    assert.match(login.cookie ?? '', /HttpOnly/i);
    cookie = login.cookie!.split(';')[0];
    const query = async (sql: string, values: number[] = []) => (await root.execute<RowDataPacket[]>(sql, values))[0];
    const balances = () => query('SELECT id_lote,quantidade_inicial,quantidade_atual FROM lote ORDER BY id_lote');
    const payments = (id: number) => query('SELECT id_forma_pagamento,valor,valor_recebido,troco FROM pagamento WHERE id_venda=? ORDER BY id_pagamento', [id]);
    const moves = (id: number) => query(`SELECT m.id_lote,m.id_item_venda,m.id_funcionario,m.tipo,m.quantidade
      FROM movimentacao_estoque m JOIN item_venda i USING (id_item_venda) WHERE i.id_venda=? ORDER BY m.id_movimentacao`, [id]);
    const state = async (id: number) => ({
      sale: (await query('SELECT status,valor_total FROM venda WHERE id_venda=?', [id]))[0],
      payments: await payments(id), moves: await moves(id), balances: await balances(),
    });
    async function open(quantity: string) {
      const sale = await post('/vendas', {});
      assert.equal(sale.status, 201, sale.body.error?.code);
      const id: number = sale.body.id_venda;
      assert.ok(Number.isSafeInteger(id));
      assert.equal((await post(`/vendas/${id}/itens`, { id_produto: 91, quantidade: quantity })).status, 201);
      return id;
    }
    const cash = (valor: string, valor_recebido: string) => ({ id_forma_pagamento: 91, valor, valor_recebido });
    const pix = (valor: string) => ({ id_forma_pagamento: 92, valor });
    const finalize = (id: number, ...pagamentos: ReturnType<typeof pix>[]) => post(`/vendas/${id}/finalizar`, { pagamentos });

    const first = await open('3');
    const before = await state(first);
    assert.deepEqual(before.sale, { status: 'ABERTA', valor_total: '130.38' });
    assert.deepEqual([before.payments, before.moves], [[], []]);
    const race = await Promise.all(Array.from({ length: 3 }, () => finalize(first, cash('130.38', '150.00'))));
    assert.deepEqual(race.map(result => result.status).sort(), [200, 409, 409]);
    assert.ok(race.filter(result => result.status === 409).every(result => result.body.error.code === 'SALE_NOT_OPEN'));
    const receipt = race.find(result => result.status === 200)!.body;
    assert.deepEqual([receipt.total_pago, receipt.total_recebido, receipt.troco], ['130.38', '150.00', '19.62']);
    const after = await state(first);
    assert.deepEqual(after.sale, { status: 'FINALIZADA', valor_total: '130.38' });
    assert.deepEqual(after.payments, [{
      id_forma_pagamento: 91, valor: '130.38', valor_recebido: '150.00', troco: '19.62',
    }]);
    const [item] = await query('SELECT id_item_venda FROM item_venda WHERE id_venda=?', [first]);
    assert.deepEqual(after.moves.map(row => Object.values(row)), [
      [91, item.id_item_venda, 91, 'SAIDA_VENDA', '2.000'],
      [92, item.id_item_venda, 91, 'SAIDA_VENDA', '1.000'],
    ]);
    assert.deepEqual(after.balances.map(row => [row.quantidade_inicial, row.quantidade_atual]),
      [['2.000', '0.000'], ['10.000', '9.000'], ['20.000', '20.000']]);
    assert.equal((await finalize(first, cash('130.38', '150.00'))).status, 409);
    assert.deepEqual(await state(first), after);
    console.info('Venda', first, 'concorrência HTTP', race.map(result => result.status), after);

    const mixed = await open('2');
    const mixedResult = await finalize(mixed, cash('50.00', '60.00'), pix('36.92'));
    assert.equal(mixedResult.status, 200);
    assert.deepEqual([mixedResult.body.total_pago, mixedResult.body.troco], ['86.92', '10.00']);
    assert.deepEqual((await payments(mixed)).map(row => [row.id_forma_pagamento, row.valor, row.troco]),
      [[91, '50.00', '10.00'], [92, '36.92', '0.00']]);
    assert.deepEqual((await moves(mixed)).map(row => [row.id_lote, row.tipo, row.quantidade]), [[92, 'SAIDA_VENDA', '2.000']]);
    console.info('Venda', mixed, 'pagamento misto HTTP 200', await payments(mixed), await moves(mixed));

    const rollback = await open('1');
    await root.query('UPDATE lote SET quantidade_atual=0 WHERE id_lote=92');
    const insufficient = await state(rollback);
    const rejected = await finalize(rollback, pix('43.46'));
    assert.equal(rejected.status, 409);
    assert.equal(rejected.body.error.code, 'INSUFFICIENT_STOCK');
    assert.deepEqual(await state(rollback), insufficient);
    await root.query('UPDATE lote SET quantidade_atual=7 WHERE id_lote=92');
    const beforeFailure = await state(rollback);
    // The final UPDATE comes after payment, withdrawal and movement inserts.
    await root.query("CREATE TRIGGER qa_fail_finalize BEFORE UPDATE ON venda FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='QA injected failure'");
    assert.equal((await finalize(rollback, pix('43.46'))).status, 500);
    assert.deepEqual(await state(rollback), beforeFailure);
    await root.query('DROP TRIGGER qa_fail_finalize');
    assert.equal((await finalize(rollback, pix('43.46'))).status, 200);
    console.info('Venda', rollback, 'estoque insuficiente 409, falha injetada 500 sem gravações parciais, nova tentativa 200');

    const cancel = await open('1');
    const [line] = await query('SELECT id_item_venda FROM item_venda WHERE id_venda=?', [cancel]);
    const path = `/vendas/${cancel}/itens/${line.id_item_venda}/cancelar`;
    const supervisor = { matricula: 'QA-SUPERVISOR', senha: supervisorPassword };
    assert.equal((await post(path, { motivo: 'Cancelamento QA', supervisor: { ...supervisor, senha: secret() } })).status, 403);
    assert.equal((await post(path, { motivo: 'Cancelamento QA', supervisor })).status, 200);
    assert.deepEqual(await query('SELECT id_supervisor FROM cancelamento_item WHERE id_item_venda=?', [line.id_item_venda]), [{ id_supervisor: 92 }]);
    assert.ok((await balances()).every(row => Number(row.quantidade_atual) >= 0));
    console.info('Venda', cancel, 'autorização de cancelamento HTTP 403/200 e supervisão persistida');
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

async function main() {
  const container = docker(['run', '-d', '--name', name, '--label', 'check02.run=' + runId,
    '--tmpfs', '/var/lib/mysql', '-e', 'MYSQL_ROOT_PASSWORD', '-e', 'MYSQL_ROOT_HOST=%', '-p', '127.0.0.1::3306', image]);
  let root: Connection | undefined;
  let pool: Pool | undefined;
  try {
    const binding = docker(['port', container, '3306/tcp']);
    const port = Number(binding.match(/^127\.0\.0\.1:(\d+)$/)?.[1]);
    assert.ok(port > 0 && port !== 3307, 'Porta de teste isolada esperada.');
    console.info('MySQL de teste:', name, binding);
    root = await connect(port);
    const [schemas] = await root.query<RowDataPacket[]>("SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE LOWER(SCHEMA_NAME)='supermercado'");
    assert.deepEqual(schemas, []);
    const password = secret();
    const supervisorPassword = secret();
    const appPassword = secret();
    await fixture(root, password, supervisorPassword, appPassword);
    pool = createPool({
      host: '127.0.0.1', port, user: 'supermercado_r03_app', password: appPassword,
      database: 'Supermercado', dateStrings: true,
    });
    await scenarios(root, pool, password, supervisorPassword);
  } finally {
    try {
      await Promise.all([pool?.end(), root?.end()]);
    } finally {
      assert.equal(docker(['inspect', '--format', '{{.Name}} {{index .Config.Labels "check02.run"}}', container]), '/' + name + ' ' + runId);
      docker(['rm', '-f', container]);
    }
  }
}

main().catch(error => {
  // Database errors can contain the input SQL, including synthetic credentials.
  console.error(error instanceof assert.AssertionError ? error.message : error.code ?? 'Falha na integração isolada.');
  process.exitCode = 1;
});
