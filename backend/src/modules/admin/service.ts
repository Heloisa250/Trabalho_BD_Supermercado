import bcrypt from 'bcryptjs';
import type { RowDataPacket } from 'mysql2/promise';
import { AdminError, type AdminRepository, type Fields, type Resource } from './repository.js';

function dates(admission: unknown, dismissal: unknown) {
  if (typeof admission === 'string' && typeof dismissal === 'string' && dismissal < admission) {
    throw new AdminError(400, 'INVALID_DATES', 'A demissão não pode anteceder a admissão.');
  }
}

export function adminService(repository: AdminRepository, resource: Resource, admins: readonly string[]) {
  function checkMatricula(value: unknown) {
    if (typeof value === 'string' && admins.includes(value)) {
      throw new AdminError(409, 'RESERVED_MATRICULA', 'Matrícula reservada pela configuração administrativa.');
    }
  }

  return {
    list: repository.list,
    async detail(id: number) {
      const result = await repository.detail(id);
      if (!result) throw new AdminError(404, 'NOT_FOUND', 'Registro não encontrado.');
      return result;
    },
    async create(fields: Fields) {
      const { senha, ...record } = fields;
      if (resource === 'funcionarios') {
        checkMatricula(record.matricula);
        dates(record.data_admissao, record.data_demissao);
        record.senha_hash = await bcrypt.hash(String(senha), 12);
      }
      return repository.create(record);
    },
    update(id: number, fields: Fields) {
      return repository.update(id, fields, (current: RowDataPacket) => {
        if (resource !== 'funcionarios') return;
        if (admins.includes(current.matricula)) {
          throw new AdminError(409, 'RESERVED_MATRICULA', 'A conta administrativa deve ser mantida pelo responsável.');
        }
        checkMatricula(fields.matricula);
        dates(fields.data_admissao ?? current.data_admissao,
          'data_demissao' in fields ? fields.data_demissao : current.data_demissao);
      });
    },
  };
}

export type AdminService = ReturnType<typeof adminService>;
