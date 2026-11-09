import assert from 'node:assert/strict';
import type { RowDataPacket } from 'mysql2/promise';
import { checkDatabase, createDatabase } from './database.js';
import { loadEnvironment } from './env.js';

async function main() {
  const { database } = loadEnvironment(true);
  if (!database) throw new Error('Conta de leitura ainda não configurada.');
  const pool = createDatabase(database);
  try {
    await checkDatabase(pool, 'Supermercado');
    const [identity] = await pool.query<RowDataPacket[]>('SELECT CURRENT_USER() AS account, @@lower_case_table_names AS caseMode');
    assert.equal(identity[0].account, database.DB_USER + '@%');
    assert.equal(identity[0].caseMode, 0);
    const [counts] = await pool.query<RowDataPacket[]>(`SELECT
      (SELECT COUNT(*) FROM information_schema.TABLES WHERE BINARY TABLE_SCHEMA = DATABASE() AND TABLE_TYPE='BASE TABLE') AS tablesCount,
      COUNT(*) AS columnsCount, SUM(EXTRA LIKE '%GENERATED%') AS generatedCount
      FROM information_schema.COLUMNS WHERE BINARY TABLE_SCHEMA = DATABASE()`);
    assert.deepEqual([counts[0].tablesCount, counts[0].columnsCount, Number(counts[0].generatedCount)], [19, 120, 0]);
    const [constraints] = await pool.query<RowDataPacket[]>(`SELECT CONSTRAINT_TYPE AS name, COUNT(*) AS total
      FROM information_schema.TABLE_CONSTRAINTS WHERE BINARY TABLE_SCHEMA = DATABASE() GROUP BY CONSTRAINT_TYPE`);
    const keys = Object.fromEntries(constraints.map((row) => [row.name, row.total]));
    assert.deepEqual(keys, { 'PRIMARY KEY': 19, 'FOREIGN KEY': 25, UNIQUE: 7 });
    const [automatic] = await pool.query<RowDataPacket[]>(`SELECT TABLE_NAME AS name FROM information_schema.COLUMNS
      WHERE BINARY TABLE_SCHEMA = DATABASE() AND EXTRA='auto_increment' ORDER BY TABLE_NAME`);
    assert.deepEqual(automatic.map((row) => row.name), ['caixa', 'cargo', 'categoria', 'forma_pagamento', 'marca']);
    const [grants] = await pool.query<RowDataPacket[]>('SHOW GRANTS');
    const allowed = ['GRANT USAGE ON *.* TO ', 'GRANT SELECT ON `Supermercado`.* TO '];
    assert.equal(grants.length, 2);
    assert.ok(allowed.every((prefix) => grants.some((row) => String(Object.values(row)[0]) ===
      prefix + '`' + database.DB_USER + '`@`%`')));
    console.info('MySQL oficial: schema Supermercado, 19 tabelas, 120 colunas, 25 FKs, 7 UNIQUE, 5 AUTO_INCREMENT, nenhuma gerada. Conta SELECT validada.');
  } finally {
    await pool.end();
  }
}

main().catch(() => {
  console.error('A validação oficial falhou. Verifique a conexão, o catálogo e os privilégios da conta.');
  process.exitCode = 1;
});
