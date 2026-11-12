import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { parse } from 'dotenv';
import mysql from 'mysql2/promise';

const root = new URL('../', import.meta.url);
const envFile = fileURLToPath(new URL('backend/.env.official', root));
const readEnvFile = fileURLToPath(new URL('backend/.env.academic-read', root));
const localHost = '127.0.0.1';
const schema = 'Supermercado';
const appUser = 'supermercado_acad_app';
const readUser = 'supermercado_acad_leitura';
const lock = 'sqlider:Supermercado:instalacao-academica';
const scripts = [
  'database/official/Supermercado_ddl.sql',
  'database/official/Supermercado_dml.sql',
  'credenciais_demo.sql',
  'database/12_views.sql',
  'database/13_functions.sql',
  'database/13_procedures.sql',
  'database/13_triggers.sql',
  'database/13_geracao_ids.sql',
  'database/14_usuarios_grupos_permissoes.sql',
  'database/13_permissoes.sql',
  'database/15_indices.sql',
  'database/validacao_academica.sql',
  'database/13_validacao.sql',
];
let step = 'configuração';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function verify(port, password, fresh = false) {
  assert(password, 'Senha da conta acadêmica ausente.');
  const conn = await mysql.createConnection({ host: localHost, port, user: appUser, password, database: schema });
  try {
    const [[{ conta }]] = await conn.query('SELECT CURRENT_USER() AS conta');
    assert(conta === appUser + '@' + localHost, 'A conexão usou uma conta técnica inesperada.');
    const [[objects]] = await conn.query(`SELECT
      (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE') AS tabelas,
      (SELECT COUNT(*) FROM information_schema.VIEWS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('vw_vendas_finalizadas','vw_estoque_produtos')) AS views,
      (SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=DATABASE() AND ROUTINE_NAME IN
        ('fn_calcular_subtotal','fn_calcular_troco','sp_consultar_estoque_produto','sp_consultar_venda')) AS rotinas_acessiveis,
      (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND CONSTRAINT_TYPE='FOREIGN KEY') AS fks,
      (SELECT COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE()
        AND INDEX_NAME IN ('ix_venda_status_data','ix_movimentacao_data')) AS indices`);
    assert(objects.tabelas === 21 && objects.views === 2 && objects.rotinas_acessiveis === 4 &&
      objects.fks === 27 && objects.indices === 2, 'Estrutura acadêmica incompleta.');
    const [users] = await conn.execute(`SELECT f.matricula, f.senha_hash, g.codigo_grupo, c.pode_cancelar_item
      FROM funcionario f JOIN usuarios u USING(id_funcionario) JOIN grupos_usuarios g USING(codigo_grupo)
      JOIN cargo c USING(id_cargo) WHERE f.ativo=1
      AND (f.data_demissao IS NULL OR f.data_demissao > DATE(UTC_TIMESTAMP() - INTERVAL 3 HOUR))
      AND f.matricula IN (?,?) ORDER BY f.matricula`, ['F0001', 'F0002']);
    assert(users.length === 2 && users[0].codigo_grupo === 'ADMINISTRADOR' &&
      users[1].codigo_grupo === 'SUPERVISOR' && users[1].pode_cancelar_item === 1 &&
      await bcrypt.compare('001', users[0].senha_hash) && await bcrypt.compare('002', users[1].senha_hash),
    'Vínculos ou credenciais acadêmicas não conferem.');
    await conn.query('SELECT id_venda FROM vw_vendas_finalizadas LIMIT 1');
    await conn.execute('CALL sp_consultar_estoque_produto(?, ?)', [1, '2026-11-12']);
    if (fresh) {
      const [tables] = await conn.query("SHOW FULL TABLES WHERE Table_type='BASE TABLE'");
      let count = 0;
      for (const row of tables) {
        const name = Object.values(row)[0];
        if (name === 'usuarios' || name === 'grupos_usuarios') continue;
        const [[{ linhas }]] = await conn.query('SELECT COUNT(*) AS linhas FROM ??', [name]);
        count += linhas;
      }
      assert(count === 98, 'A carga inicial oficial deveria ter 98 linhas.');
    }
    console.log('Banco acadêmico verificado. Inicie com npm run demo:start.');
  } finally {
    await conn.end();
  }
}

// DELIMITER é comando do cliente. Envie uma definição completa por vez.
async function importFile(conn, file) {
  const sql = readFileSync(new URL(file, root), 'utf8').replace(/^\uFEFF/, '');
  if (!/^DELIMITER /m.test(sql)) return (await conn.query(sql))[0];
  let delimiter = ';';
  let pending = '';
  for (const line of sql.split(/\r?\n/)) {
    const next = /^DELIMITER\s+(\S+)$/.exec(line.trim());
    if (next) {
      assert(!pending.trim(), 'Definição incompleta antes de DELIMITER.');
      delimiter = next[1];
    } else if (line.trim() || pending) {
      pending += line + '\n';
      const statement = pending.trimEnd();
      if (statement.endsWith(delimiter)) {
        await conn.query(statement.slice(0, -delimiter.length));
        pending = '';
      }
    }
  }
  assert(!pending.trim(), 'Definição SQL incompleta.');
  return [];
}

async function readConnection() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  assert(major > 22 || (major === 22 && minor >= 12), 'Instale o Node.js 22.12 ou superior.');
  let masked = false;
  const terminal = Boolean(process.stdin.isTTY);
  const output = new Writable({
    write(chunk, _encoding, callback) {
      if (masked) callback();
      else process.stdout.write(chunk, callback);
    },
  });
  output.columns = process.stdout.columns;
  const reader = createInterface({ input: process.stdin, output, terminal, crlfDelay: Infinity });
  reader.on('SIGINT', () => reader.close());
  const lines = reader[Symbol.asyncIterator]();
  async function ask(label, secret = false) {
    process.stdout.write(label + ': ');
    masked = secret;
    const { value, done } = await lines.next();
    masked = false;
    if (secret || !terminal) process.stdout.write('\n');
    assert(!done, 'Instalação cancelada.');
    return value;
  }
  try {
    const port = Number((await ask('Porta da instância acadêmica [3307]')).trim() || '3307');
    assert(Number.isInteger(port) && port >= 1 && port <= 65535, 'Porta MySQL inválida.');
    const user = (await ask('Conta administrativa [root]')).trim() || 'root';
    assert(await ask('Confirme 127.0.0.1:' + port + ' como instância acadêmica. Digite INSTALAR') === 'INSTALAR',
      'Instalação cancelada.');
    return { port, user, password: await ask('Senha da conta administrativa local', true) };
  } finally {
    reader.close();
  }
}

async function setup() {
  assert(!existsSync(envFile) && !existsSync(readEnvFile), 'Configuração local já existe. Use npm run demo:verify ou preserve os arquivos antes de configurar outra instância.');
  const { port, user, password } = await readConnection();
  const conn = await mysql.createConnection({
    host: localHost, port, user, password, connectTimeout: 5000, multipleStatements: true,
  });
  let acquired = false;
  try {
    const [[target]] = await conn.query('SELECT VERSION() AS versao, @@port AS porta, @@server_uuid AS uuid');
    assert(/^8\.4\./.test(target.versao) && target.porta === port, 'O destino precisa ser MySQL 8.4 local na porta confirmada.');
    console.log('Destino MySQL ' + target.versao + ' em ' + localHost + ':' + target.porta + ' (' + target.uuid + ').');
    const [[{ obtido }]] = await conn.execute('SELECT GET_LOCK(?, 0) AS obtido', [lock]);
    acquired = obtido === 1;
    assert(acquired, 'Já existe uma instalação acadêmica em andamento.');
    const [[{ total }]] = await conn.query(`SELECT
      (SELECT COUNT(*) FROM information_schema.TABLES WHERE LOWER(TABLE_SCHEMA)='supermercado') +
      (SELECT COUNT(*) FROM information_schema.ROUTINES WHERE LOWER(ROUTINE_SCHEMA)='supermercado') +
      (SELECT COUNT(*) FROM information_schema.EVENTS WHERE LOWER(EVENT_SCHEMA)='supermercado') AS total`);
    const [[accounts]] = await conn.execute("SELECT COUNT(*) AS total FROM mysql.user WHERE User IN (?,?)", [appUser, readUser]);
    assert(total === 0 && accounts.total === 0,
      'Destino existente ou com contas acadêmicas. Nenhum dado foi alterado. Use demo:verify se já houver configuração.');
    const appPassword = randomBytes(32).toString('hex') + '!Aa9';
    const readPassword = randomBytes(32).toString('hex') + '!Aa9';
    for (const file of scripts) {
      step = file;
      const result = await importFile(conn, file);
      const rows = Array.isArray(result) ? result.flat() : [];
      if (file === 'credenciais_demo.sql') {
        assert(rows.some(row => row?.resultado?.startsWith('OK:')), 'As credenciais acadêmicas não foram configuradas.');
      }
      if (file === 'database/14_usuarios_grupos_permissoes.sql') {
        // Altera apenas as duas contas recém-criadas neste destino acadêmico.
        await conn.query("ALTER USER 'supermercado_acad_app'@'127.0.0.1' IDENTIFIED BY ?", [appPassword]);
        await conn.query("ALTER USER 'supermercado_acad_leitura'@'127.0.0.1' IDENTIFIED BY ?", [readPassword]);
      }
      if (file === 'database/13_validacao.sql') {
        const [[catalog]] = await conn.query(`SELECT
          (SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND EVENT_OBJECT_TABLE='lote'
            AND TRIGGER_NAME IN ('trg_lote_validar_insert','trg_lote_validar_update')) AS gatilhos,
          (SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=DATABASE()
            AND ROUTINE_NAME='sp_registrar_ajuste_lote') AS ajuste`);
        assert(catalog.gatilhos === 2 && catalog.ajuste === 1, 'Triggers ou procedure de ajuste ausentes.');
      }
      console.log('OK ' + file);
    }
    step = 'verificação da conta acadêmica';
    await verify(port, appPassword, true);
    writeFileSync(readEnvFile, ['DB_HOST=' + localHost, 'DB_PORT=' + port, 'DB_USER=' + readUser,
      'DB_PASSWORD=' + readPassword, ''].join('\n'), { flag: 'wx', mode: 0o600 });
    step = 'gravação de backend/.env.official';
    writeFileSync(envFile, [
      'ACADEMIC_DEMO=1', 'PORT=3002', 'CORS_ORIGIN=http://127.0.0.1:5176',
      'DB_HOST=' + localHost, 'DB_PORT=' + port, 'DB_USER=' + appUser,
      'DB_PASSWORD="' + appPassword + '"', 'JWT_SECRET=' + randomBytes(32).toString('hex'),
      'ADMIN_MATRICULAS=F0001', '',
    ].join('\n'), { flag: 'wx', mode: 0o600 });
    console.log('Configuração local gravada. API em 3002 e React em http://127.0.0.1:5176.');
  } finally {
    try { if (acquired) await conn.execute('DO RELEASE_LOCK(?)', [lock]); }
    finally { await conn.end(); }
  }
}

try {
  if (process.argv.includes('--verify')) {
    const env = parse(readFileSync(envFile));
    assert(env.ACADEMIC_DEMO === '1' && env.DB_HOST === localHost && env.DB_USER === appUser,
      'O arquivo local não pertence a esta instalação acadêmica.');
    await verify(Number(env.DB_PORT), env.DB_PASSWORD);
  } else {
    await setup();
  }
} catch (error) {
  // Erros do driver podem conter instruções SQL ou credenciais.
  const detail = error.code ? String(error.code) : error instanceof SyntaxError ? 'Entrada inválida.' : error.message;
  console.error('Falha em ' + step + ' — ' + detail);
  if (step.startsWith('database/') || step === 'credenciais_demo.sql') {
    console.error('DDL pode ter sido aplicado parcialmente. Inspecione a instância antes de retomar.');
  }
  process.exitCode = 1;
}
