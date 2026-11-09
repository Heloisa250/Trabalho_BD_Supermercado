import bcrypt from 'bcryptjs';
import type { RequestHandler } from 'express';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { password } from '../admin/schemas.js';
import { AuthDatabaseError } from './service.js';

const input = z.object({
  senhaAtual: z.string().min(1).refine((s) => Buffer.byteLength(s, 'utf8') <= 72),
  novaSenha: password,
}).strict().refine((data) => data.senhaAtual !== data.novaSenha);

export function changePassword(pool?: Pool): RequestHandler {
  return async (req, res) => {
    const data = input.safeParse(req.body);
    if (!data.success) {
      res.status(400).json({ error: { code: 'INVALID_PASSWORD', message: 'Use uma senha diferente, com 12 ou mais caracteres, letras e números ou símbolos, até 72 bytes.' } });
      return;
    }
    if (!pool) throw new AuthDatabaseError();
    const id = res.locals.employee.id;
    const active = 'ativo=1 AND (data_demissao IS NULL OR data_demissao>CURRENT_DATE)';
    try {
      const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT senha_hash FROM funcionario WHERE id_funcionario=? AND ' + active, [id]);
      const hash = rows[0]?.senha_hash;
      if (!hash || !await bcrypt.compare(data.data.senhaAtual, hash)) {
        res.status(401).json({ error: { code: 'INVALID_PASSWORD', message: 'Senha atual inválida.' } });
        return;
      }
      const replacement = await bcrypt.hash(data.data.novaSenha, 12);
      const [result] = await pool.execute<ResultSetHeader>(
        'UPDATE funcionario SET senha_hash=? WHERE id_funcionario=? AND BINARY senha_hash=? AND ' + active,
        [replacement, id, hash]);
      if (result.affectedRows !== 1) {
        res.status(409).json({ error: { code: 'PASSWORD_CHANGED', message: 'A conta mudou. Entre novamente.' } });
        return;
      }
      res.sendStatus(204);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error &&
        (error.code === 'ER_TABLEACCESS_DENIED_ERROR' || error.code === 'ER_COLUMNACCESS_DENIED_ERROR')) {
        res.status(503).json({ error: { code: 'DATABASE_WRITE_UNAVAILABLE', message: 'A alteração de senha está indisponível por configuração do banco.' } });
        return;
      }
      throw new AuthDatabaseError();
    }
  };
}
