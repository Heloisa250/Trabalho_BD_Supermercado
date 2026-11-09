import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import bcrypt from 'bcryptjs';
import { createConnection, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';

async function validateLogin(matricula: string, senha: string) {
  const origin = 'http://127.0.0.1:5176';
  const api = origin + '/api/v1/';
  const login = await fetch(api + 'auth/login', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ matricula, senha }), signal: AbortSignal.timeout(8000),
  });
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  if (!login.ok || !cookie?.startsWith('sqlider_official_session=')) {
    throw new Error('A credencial foi gravada, mas o teste de login oficial falhou.');
  }
  try {
    const me = await fetch(api + 'auth/me', { headers: { Cookie: cookie }, signal: AbortSignal.timeout(8000) });
    const access = await fetch(api + 'admin/access', { headers: { Cookie: cookie }, signal: AbortSignal.timeout(8000) });
    const crossed = await fetch('http://127.0.0.1:3001/api/v1/auth/me', {
      headers: { Cookie: cookie.replace('sqlider_official_session=', 'sqlider_session=') }, signal: AbortSignal.timeout(8000),
    });
    if (!me.ok || (await me.json()).matricula !== matricula || !access.ok
      || (await access.json()).autorizado !== true || crossed.status !== 401) {
      throw new Error('A credencial foi gravada, mas a validação de sessão ou acesso falhou.');
    }
    console.info('Login, sessão, acesso administrativo e rejeição no legado confirmados.');
  } finally {
    const logout = await fetch(api + 'auth/logout', {
      method: 'POST', headers: { Origin: origin, Cookie: cookie }, signal: AbortSignal.timeout(8000),
    });
    if (logout.status !== 204 || !logout.headers.get('set-cookie')?.startsWith('sqlider_official_session=;')) {
      throw new Error('A credencial foi gravada, mas o teste de logout falhou.');
    }
    console.info('Logout oficial confirmado.');
  }
}

async function main() {
  const [matricula, ...extra] = process.argv.slice(2);
  if (matricula !== 'F0001' || extra.length) throw new Error('Este provisionamento foi autorizado somente para F0001.');
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Use um terminal interativo.');

  const silent = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  const prompt = createInterface({ input: process.stdin, output: silent, terminal: true, historySize: 0 });
  async function secret(label: string) {
    process.stdout.write(label);
    try { return await prompt.question(''); }
    finally { process.stdout.write('\n'); }
  }
  try {
    const settings = parse(readFileSync('.env.r02-provision'));
    const password = settings.PROVISION_PASSWORD;
    const expectedUuid = settings.OFFICIAL_SERVER_UUID;
    if (!/^[0-9a-f-]{36}$/i.test(expectedUuid ?? '')) throw new Error('UUID oficial ausente ou inválido.');
    if (!password) throw new Error('Informe a senha da conta de provisionamento.');
    const db = await createConnection({
      host: '127.0.0.1', port: 3307, database: 'Supermercado',
      user: 'supermercado_r02_provision', password, connectTimeout: 3000, multipleStatements: false,
    });
    try {
      const [[server]] = await db.query<RowDataPacket[]>('SELECT DATABASE() AS dbName, @@server_uuid AS uuid');
      if (server.dbName !== 'Supermercado' || server.uuid !== expectedUuid) {
        throw new Error('A identidade do destino não corresponde à instância oficial.');
      }
      const [[employee]] = await db.execute<RowDataPacket[]>(
        'SELECT id_funcionario, matricula, senha_hash FROM funcionario WHERE matricula=?', [matricula]);
      if (!employee || employee.matricula !== matricula) throw new Error('Matrícula oficial não encontrada.');
      if (!/^[0-9a-f]{64}$/i.test(employee.senha_hash)) throw new Error('A conta não está no formato legado esperado.');
      process.stdout.write('Destino confirmado: Supermercado, porta 3307, matrícula ' + matricula + '.\n');
      const next = await secret('Nova senha do funcionário: ');
      const confirmation = await secret('Confirme a nova senha: ');
      if (next !== confirmation) throw new Error('A confirmação não corresponde à nova senha.');
      if (next.length < 12 || Buffer.byteLength(next, 'utf8') > 72 || !/\p{L}/u.test(next)
        || !/\d/.test(next) || !/[^\p{L}\p{N}\s]/u.test(next)
        || /(?:senha|password|12345|qwerty)/i.test(next) || new Set(next).size < 8) {
        throw new Error('Use 12 ou mais caracteres distintos, com letras, números e símbolos, até 72 bytes, sem sequências comuns.');
      }
      const hash = await bcrypt.hash(next, 12);
      if (hash.length !== 60) throw new Error('Hash incompatível com senha_hash CHAR(64).');
      const [result] = await db.execute<ResultSetHeader>(
        'UPDATE funcionario SET senha_hash=? WHERE id_funcionario=? AND matricula=? AND BINARY senha_hash=?',
        [hash, employee.id_funcionario, matricula, employee.senha_hash]);
      if (result.affectedRows !== 1) throw new Error('A credencial mudou durante a operação. Nenhuma atualização aplicada.');
      console.info('Credencial bcrypt provisionada para ' + matricula + '.');
      await validateLogin(matricula, next);
    } finally { await db.end(); }
  } finally { prompt.close(); }
}

main().catch((error: unknown) => {
  const known = error instanceof Error && !('code' in error);
  console.error(known ? error.message : 'Falha de conexão ou provisionamento. Verifique o destino e os privilégios.');
  process.exitCode = 1;
});
