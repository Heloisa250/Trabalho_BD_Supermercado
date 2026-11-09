import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import type { Employee, EmployeeRepository } from './repository.js';

const issuer = 'supermercado-qualidade-lider';
const legacyAudience = 'funcionario';
const dummyHash = bcrypt.hashSync(randomBytes(32).toString('hex'), 12);

function publicProfile(employee: Employee) {
  return {
    id: employee.id,
    nome: employee.nome,
    matricula: employee.matricula,
    cargo: { id: employee.cargoId, nome: employee.cargoNome },
    permissoes: { pode_cancelar_item: employee.podeCancelar === 1 },
  };
}

export type PublicEmployee = ReturnType<typeof publicProfile>;

export function canCancelItem(employee: PublicEmployee) {
  return employee.permissoes.pode_cancelar_item === true;
}

export class AuthDatabaseError extends Error {}

export function authService(repository: EmployeeRepository, secret: string, ttl: number, official = false) {
  const audience = official ? 'funcionario-oficial' : legacyAudience;
  async function lookup(query: () => Promise<Employee | undefined>) {
    try {
      return await query();
    } catch {
      throw new AuthDatabaseError();
    }
  }

  return {
    cookieName: official ? 'sqlider_official_session' : 'sqlider_session',
    async login(matricula: string, senha: string) {
      const employee = await lookup(() => repository.byMatricula(matricula));
      const hash = employee?.senhaHash;
      const validHash = hash && /^\$2[aby]\$(?:0[4-9]|1[0-4])\$[./A-Za-z0-9]{53}$/.test(hash);
      const matches = await bcrypt.compare(senha, validHash ? hash : dummyHash);
      if (!employee || !validHash || !matches) return;
      const token = jwt.sign({}, secret, {
        algorithm: 'HS256', subject: String(employee.id), expiresIn: ttl, issuer, audience,
      });
      return { token, employee: publicProfile(employee) };
    },
    async session(token: string) {
      let id: number;
      try {
        const claims = jwt.verify(token, secret, { algorithms: ['HS256'], issuer, audience });
        if (typeof claims === 'string' || !claims.sub || !/^\d+$/.test(claims.sub)
          || typeof claims.exp !== 'number') return;
        id = Number(claims.sub);
        if (!Number.isSafeInteger(id) || id < 1) return;
      } catch {
        return;
      }
      const employee = await lookup(() => repository.byId(id));
      return employee && publicProfile(employee);
    },
  };
}

export type AuthService = ReturnType<typeof authService>;
