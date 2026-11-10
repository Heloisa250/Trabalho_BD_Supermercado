import type { Pool, RowDataPacket } from 'mysql2/promise';
import { sqlBusinessDate } from '../../config/business-time.js';

export interface Employee extends RowDataPacket {
  id: number;
  nome: string;
  matricula: string;
  cargoId: number;
  cargoNome: string;
  podeCancelar: number;
  senhaHash?: string;
}

export function employeeRepository(pool?: Pool) {
  const profile = `SELECT f.id_funcionario AS id, f.nome, f.matricula,
    c.id_cargo AS cargoId, c.nome AS cargoNome, c.pode_cancelar_item AS podeCancelar`;
  const from = () => `FROM funcionario f JOIN cargo c ON c.id_cargo = f.id_cargo
    WHERE f.ativo = 1 AND (f.data_demissao IS NULL OR f.data_demissao > ${sqlBusinessDate()})`;

  async function find(sql: string, value: string | number) {
    if (!pool) throw new Error('MySQL indisponível');
    const [rows] = await pool.execute<Employee[]>({ sql, timeout: 3000 }, [value]);
    return rows[0];
  }

  return {
    byMatricula: (matricula: string) => find(profile + ', f.senha_hash AS senhaHash ' + from() + ' AND f.matricula = ?', matricula),
    byId: (id: number) => find(profile + ' ' + from() + ' AND f.id_funcionario = ?', id),
  };
}

export type EmployeeRepository = ReturnType<typeof employeeRepository>;
