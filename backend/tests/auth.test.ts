import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { authService, canCancelItem } from '../src/modules/auth/service.js';
import type { Employee } from '../src/modules/auth/repository.js';

test('contratos de autenticação HTTP com repositório isolado', async (context) => {
  const origin = 'http://127.0.0.1:5175';
  const secret = 'integration-test-only-secret-that-is-not-used-in-the-app';
  const password = 'senha de teste isolado';
  const senhaHash = await bcrypt.hash(password, 4);
  const operator = { id: 1, nome: 'Operador', matricula: 'OPERADOR', cargoId: 1, cargoNome: 'Operador',
    podeCancelar: 0, senhaHash, cpf: 'privado', salario: 'privado' } as unknown as Employee;
  const supervisor = { ...operator, id: 2, matricula: 'SUPERVISOR', podeCancelar: 1 } as Employee;
  let active = true;
  let available = true;
  const lookup = (employee?: Employee) => {
    if (!available) throw new Error('informação privada');
    return employee;
  };
  const service = authService({
    byMatricula: async (value) => lookup(value === supervisor.matricula ? supervisor
      : value === operator.matricula && active ? operator : undefined),
    byId: async (id) => lookup(id === 2 ? supervisor : id === 1 && active ? operator : undefined),
  }, secret, 1800);
  const server = createApp({
    corsOrigin: origin, checkDatabase: async () => {}, auth: { service, ttl: 1800, secure: false },
  }).listen(0, '127.0.0.1');
  context.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = 'http://127.0.0.1:' + address.port + '/api/v1/auth';

  const sendLogin = (matricula: string, senha = password, source = origin) => fetch(base + '/login', {
    method: 'POST', headers: { Origin: source, 'Content-Type': 'application/json' },
    body: JSON.stringify({ matricula, senha }),
  });
  const me = (cookie = '') => fetch(base + '/me', { headers: { Cookie: cookie } });

  assert.equal((await me()).status, 401);
  assert.equal((await sendLogin(operator.matricula, password, 'https://invalid.example')).status, 403);
  const wrong = await sendLogin(operator.matricula, 'errada');
  assert.equal(wrong.status, 401);
  const wrongBody = await wrong.json();
  const absent = await sendLogin('INEXISTENTE');
  assert.equal(absent.status, 401);
  assert.deepEqual(await absent.json(), wrongBody);
  active = false;
  const inactive = await sendLogin(operator.matricula);
  assert.equal(inactive.status, 401);
  assert.deepEqual(await inactive.json(), wrongBody);
  active = true;

  const logged = await sendLogin(operator.matricula);
  assert.equal(logged.status, 200);
  assert.equal(logged.headers.get('access-control-allow-credentials'), 'true');
  const setCookie = logged.headers.get('set-cookie');
  assert.ok(setCookie?.includes('HttpOnly') && setCookie.includes('SameSite=Lax'));
  assert.ok(setCookie);
  const cookie = setCookie.split(';')[0];
  const profile = await logged.json();
  assert.deepEqual(Object.keys(profile).sort(), ['cargo', 'id', 'matricula', 'nome', 'permissoes']);
  const restored = await me(cookie);
  assert.equal(restored.status, 200);
  assert.deepEqual(await restored.json(), profile);
  assert.equal(canCancelItem(profile), false);
  const elevated = await sendLogin(supervisor.matricula);
  assert.equal(elevated.status, 200);
  assert.equal(canCancelItem(await elevated.json()), true);
  active = false;
  assert.equal((await me(cookie)).status, 401);
  active = true;

  const expired = jwt.sign({}, secret, { algorithm: 'HS256', subject: '1', issuer: 'supermercado-qualidade-lider',
    audience: 'funcionario', expiresIn: -1 });
  assert.equal((await me('sqlider_session=' + expired)).status, 401);
  assert.equal((await me(cookie + 'corrompido')).status, 401);

  available = false;
  const outage = await me(cookie);
  assert.equal(outage.status, 503);
  assert.equal((await outage.json()).error.code, 'DATABASE_UNAVAILABLE');
  assert.equal((await sendLogin(operator.matricula)).status, 503);
  available = true;

  const logout = await fetch(base + '/logout', { method: 'POST', headers: { Origin: origin, Cookie: cookie } });
  assert.equal(logout.status, 204);
  assert.match(logout.headers.get('set-cookie') ?? '', /^sqlider_session=;/);
  assert.equal((await me()).status, 401);
});

test('cookies e JWT não autenticam entre os dois ambientes', async (context) => {
  const origin = 'http://localhost:5176';
  const secret = 'segredo-de-teste-compartilhado-para-validar-audience';
  const hash = await bcrypt.hash('CredencialApenasParaTeste!', 4);
  const employee = { id: 1, matricula: 'F0001', nome: 'Teste', cargoId: 1, cargoNome: 'Supervisor',
    podeCancelar: 1, senhaHash: hash } as unknown as Employee;
  const legacyEmployee = { ...employee, senhaHash: 'a'.repeat(64) } as Employee;
  const repository = {
    byMatricula: async (matricula: string) => matricula === 'F0001' ? employee
      : matricula === 'F0002' ? legacyEmployee : undefined,
    byId: async (id: number) => id === 1 ? employee : undefined,
  };
  async function api(official: boolean) {
    const service = authService(repository, secret, 300, official);
    const server = createApp({ corsOrigin: origin, checkDatabase: async () => {},
      auth: { service, secure: false, ttl: 300 } }).listen(0, '127.0.0.1');
    context.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    return 'http://127.0.0.1:' + address.port + '/api/v1/';
  }
  const legacy = await api(false);
  const official = await api(true);
  const login = (base: string, matricula: string) => fetch(base + 'auth/login', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ matricula, senha: 'CredencialApenasParaTeste!' }),
  });
  const invalid = await login(official, 'F0002');
  const missing = await login(official, 'F9999');
  assert.equal(invalid.status, 401);
  assert.equal(missing.status, 401);
  assert.deepEqual(await invalid.json(), await missing.json());
  const legacyLogin = await login(legacy, 'F0001');
  const officialLogin = await login(official, 'F0001');
  assert.equal(legacyLogin.status, 200);
  assert.equal(officialLogin.status, 200);
  const oldCookie = legacyLogin.headers.get('set-cookie')!.split(';')[0];
  const newCookie = officialLogin.headers.get('set-cookie')!.split(';')[0];
  assert.match(oldCookie, /^sqlider_session=/);
  assert.match(newCookie, /^sqlider_official_session=/);
  const me = (base: string, cookie: string) => fetch(base + 'auth/me', { headers: { Cookie: cookie } });
  assert.equal((await me(official, oldCookie)).status, 401);
  assert.equal((await me(official, oldCookie.replace('sqlider_session=', 'sqlider_official_session='))).status, 401);
  assert.equal((await me(legacy, newCookie.replace('sqlider_official_session=', 'sqlider_session='))).status, 401);
  const both = oldCookie + '; ' + newCookie;
  assert.equal((await me(official, both)).status, 200);
  assert.equal((await me(legacy, both)).status, 200);
  const denied = await fetch(official + 'cargos', { headers: { Cookie: both } });
  assert.equal(denied.status, 403);
  const logout = await fetch(official + 'auth/logout', { method: 'POST', headers: { Origin: origin, Cookie: both } });
  assert.equal(logout.status, 204);
  assert.match(logout.headers.get('set-cookie') ?? '', /^sqlider_official_session=;/);
  assert.equal((await me(legacy, oldCookie)).status, 200);
});