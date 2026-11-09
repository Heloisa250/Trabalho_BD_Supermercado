import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'dotenv';

const [mode = 'fresh', project = 'supermercado-qualidade-lider-oficial-dev',
  composeEnv = '.env.official', apiEnv = 'backend/.env.official',
  provisionEnv = 'backend/.env.r02-provision'] = process.argv.slice(2);
assert.ok(['fresh', 'restored', 'existing-r03'].includes(mode), 'Modo inválido.');
assert.match(project, /^[a-z0-9][a-z0-9_-]+$/);
const fresh = mode === 'fresh';
const newProfiles = mode !== 'existing-r03';
for (const file of [apiEnv, provisionEnv]) {
  assert.match(file, /^backend\/\.env\.[a-z0-9][a-z0-9.-]*$/i);
  assert.ok(!file.toLowerCase().endsWith('.example'), 'O destino deve ser um arquivo local ignorado.');
}
assert.notEqual(apiEnv, provisionEnv);
const readEnv = apiEnv + '.read';
const opts = ['compose', '--env-file', composeEnv, '-f', 'compose.official.yaml', '-p', project];
const hashes = {
  'Supermercado_ddl.sql': 'd5227f6e5259da79f157d88b79a9d44df437025e3ba99357a754924c603c1308',
  'Supermercado_dml.sql': '0da3145472fdfa9f13ed89c467045d04c66db8027dd0691dbf6638a215960cd8',
  'Supermercado_testes.sql': 'c2c2e51c087a42449e91f9afc694a3b007d785c2fd3db694629c2f1a927f944b',
  'Justificativa_auto_increment.txt': '1bd21f042d5b95798c23673e766c7a886eff839456da05dc1be1f9f5589748fd',
};
const counts = {
  caixa: 5, cargo: 5, forma_pagamento: 5, marca: 5, categoria: 5, fornecedor: 5, funcionario: 5, produto: 5,
  sessao_caixa: 3, venda: 5, item_venda: 10, pagamento: 4, nota_fiscal: 3, pedido_compra: 5,
  produto_fornecedor: 5, item_pedido_compra: 5, lote: 5, movimentacao_estoque: 11, cancelamento_item: 2,
};
const appTables = ['funcionario', 'cargo', 'caixa', 'forma_pagamento'];
const secret = () => randomBytes(32).toString('hex');
function docker(args, label, input, confidential = false) {
  const result = spawnSync('docker', args, { encoding: 'utf8', input, windowsHide: true });
  if (result.status !== 0) {
    if (!confidential && result.stderr) process.stderr.write(result.stderr);
    throw new Error(label + ' falhou.');
  }
  return result.stdout.trim();
}
const compose = (args, label) => docker([...opts, ...args], label);
const inside = (command, label) => compose(['exec', '-T', 'mysql', 'sh', '-c', command], label);
const sql = (query, confidential = false) => docker([...opts, 'exec', '-T', 'mysql', 'sh', '-c',
  'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -NB'], 'Consulta MySQL', query, confidential);
function verifyAccounts(names) {
  const list = names.map((name) => "'" + name + "'").join(',');
  if (sql('SELECT COUNT(*) FROM mysql.user WHERE User IN (' + list + ');') !== '0') {
    throw new Error('Conta já existente. Confira os privilégios antes de continuar.');
  }
}
function createUser(name, password, grants) {
  sql(["CREATE USER '" + name + "'@'%' IDENTIFIED BY '" + password + "';",
    ...grants.map((grant) => grant + " TO '" + name + "'@'%';")].join('\n'), true);
  console.log(sql("SHOW GRANTS FOR '" + name + "'@'%';"));
}

for (const [file, hash] of Object.entries(hashes)) {
  assert.equal(createHash('sha256').update(readFileSync('database/official/' + file)).digest('hex'), hash, file);
}
compose(['config', '--quiet'], 'Validação Compose');
const id = compose(['ps', '-q', 'mysql'], 'Identificação MySQL');
assert.ok(id, 'Inicie o serviço MySQL antes de executar.');
const identity = docker(['inspect', '--format', '{{.Name}} {{.State.Health.Status}} {{.Config.Image}}', id], 'Inspeção');
assert.equal(identity, '/' + project + '-mysql-1 healthy mysql:8.4.13');
const port = compose(['port', 'mysql', '3306'], 'Porta MySQL').match(/^127\.0\.0\.1:(\d+)$/)?.[1];
assert.ok(port, 'MySQL deve ser publicado apenas em loopback.');
assert.equal(sql('SELECT VERSION(),@@lower_case_table_names;'), '8.4.13\t0');
const schema = sql("SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE LOWER(SCHEMA_NAME)='supermercado';");
let current;
if (newProfiles) {
  if (fresh) assert.equal(schema, '', 'O schema já existe. A carga foi interrompida.');
  else assert.equal(schema, 'Supermercado', 'Restaure o dump oficial antes de criar as contas.');
  assert.ok(!existsSync(apiEnv) && !existsSync(provisionEnv) && !existsSync(readEnv), 'Arquivos locais de destino já existem.');
  verifyAccounts(['supermercado_r03_app', 'supermercado_r01', 'supermercado_r02_provision']);
  if (fresh) {
  for (const file of ['Supermercado_ddl.sql', 'Supermercado_dml.sql']) {
    assert.equal(inside('sha256sum /official/' + file, 'Hash da montagem').split(/\s+/)[0], hashes[file]);
  }
  inside('MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot --batch --default-character-set=utf8mb4 < /official/Supermercado_ddl.sql', 'Carga do DDL');
  inside('{ printf "START TRANSACTION;\\n"; cat /official/Supermercado_dml.sql && printf "\\nCOMMIT;\\n"; } | MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot --batch --default-character-set=utf8mb4 Supermercado', 'Carga do DML');
  }
} else {
  assert.equal(project, 'supermercado-qualidade-lider-oficial-dev');
  assert.equal(port, '3307');
  assert.equal(schema, 'Supermercado');
  assert.equal(apiEnv, 'backend/.env.official');
  current = readFileSync(apiEnv, 'utf8');
  assert.equal(parse(current).DB_USER, 'supermercado_r01');
  assert.ok(parse(current).DB_PASSWORD);
  console.log(sql("SHOW GRANTS FOR 'supermercado_r01'@'%'; SHOW GRANTS FOR 'supermercado_r02_provision'@'%';"));
  verifyAccounts(['supermercado_r03_app']);
}
assert.equal(sql(`SELECT CONCAT(
 (SELECT COUNT(*) FROM information_schema.TABLES WHERE BINARY TABLE_SCHEMA='Supermercado' AND ENGINE='InnoDB'), ':',
 (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE BINARY TABLE_SCHEMA='Supermercado'), ':',
 (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE BINARY TABLE_SCHEMA='Supermercado' AND CONSTRAINT_TYPE='FOREIGN KEY'));`), '19:120:25');

if (fresh) {
  const actual = sql(Object.keys(counts).map((table) => "SELECT '" + table + "',COUNT(*) FROM Supermercado." + table).join(' UNION ALL ') + ';');
  assert.equal(actual, Object.entries(counts).map(([table, count]) => table + '\t' + count).join('\n'));
  console.log('Carga validada: 19 tabelas, 25 FKs e 98 registros.');
}

const appPassword = secret();
createUser('supermercado_r03_app', appPassword, ['GRANT SELECT ON Supermercado.*',
  ...appTables.map((table) => 'GRANT INSERT, UPDATE ON Supermercado.' + table)]);
if (newProfiles) {
  const readPassword = secret();
  const provisionPassword = secret();
  createUser('supermercado_r01', readPassword, ['GRANT SELECT ON Supermercado.*']);
  createUser('supermercado_r02_provision', provisionPassword,
    ['GRANT SELECT (id_funcionario, matricula, senha_hash), UPDATE (senha_hash) ON Supermercado.funcionario']);
  const uuid = sql('SELECT @@server_uuid;');
  writeFileSync(readEnv, [
    'DB_HOST=127.0.0.1', 'DB_PORT=' + port, 'DB_USER=supermercado_r01', 'DB_PASSWORD=' + readPassword, '',
  ].join('\n'), { flag: 'wx', mode: 0o600 });
  writeFileSync(provisionEnv, 'OFFICIAL_SERVER_UUID=' + uuid + '\nPROVISION_PASSWORD=' + provisionPassword + '\n', { flag: 'wx', mode: 0o600 });
  writeFileSync(apiEnv, [
    'PORT=3002', 'DB_HOST=127.0.0.1', 'DB_PORT=' + port, 'DB_USER=supermercado_r03_app',
    'DB_PASSWORD=' + appPassword, 'JWT_SECRET=' + secret(), 'ADMIN_MATRICULAS=F0001', '',
  ].join('\n'), { flag: 'wx', mode: 0o600 });
} else {
  writeFileSync(apiEnv, current.replace(/^DB_USER=.*$/m, 'DB_USER=supermercado_r03_app')
    .replace(/^DB_PASSWORD=.*$/m, 'DB_PASSWORD=' + appPassword));
}
console.log('Perfil oficial preparado. Inicie somente a API oficial.');
