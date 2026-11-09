import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';

export class MysqlLockTimeout extends Error {}
export class MysqlIdLimit extends Error {}

export async function transaction<T>(pool: Pool, operation: (connection: PoolConnection) => Promise<T>, lock?: string) {
  const connection = await pool.getConnection();
  let locked = false;
  let healthy = true;
  try {
    if (lock) {
      let result: RowDataPacket[];
      try {
        [result] = await connection.execute<RowDataPacket[]>('SELECT GET_LOCK(?, 5) AS acquired', [lock]);
      } catch (error) {
        healthy = false;
        throw error;
      }
      if (result[0]?.acquired !== 1) throw new MysqlLockTimeout();
      locked = true;
    }
    await connection.beginTransaction();
    try {
      const result = await operation(connection);
      await connection.commit();
      return result;
    } catch (error) {
      try { await connection.rollback(); }
      catch { healthy = false; }
      throw error;
    }
  } finally {
    if (locked && healthy) {
      try {
        const [[row]] = await connection.execute<RowDataPacket[]>('SELECT RELEASE_LOCK(?) AS released', [lock!]);
        healthy = row?.released === 1;
      } catch { healthy = false; }
    }
    if (healthy) connection.release();
    else connection.destroy();
  }
}

// Identifiers are static schema metadata, never fields provided by a client.
// The caller must hold the corresponding named lock until commit or rollback.
export async function nextExplicitId(connection: PoolConnection, table: string, key: string) {
  if (![table, key].every((name) => /^[a-z_]+$/.test(name))) throw new Error('Identificador SQL inválido.');
  const [[row]] = await connection.execute<RowDataPacket[]>(`SELECT COALESCE(MAX(${key}), 0) AS maxId FROM ${table}`);
  const next = Math.max(Number(row.maxId), 0) + 1;
  if (!Number.isSafeInteger(next) || next > 2147483647) throw new MysqlIdLimit();
  return next;
}
