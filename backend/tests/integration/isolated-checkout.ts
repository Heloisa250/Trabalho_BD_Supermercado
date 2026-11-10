// Teste real ISOLADO do Script 09: roda contra uma CÓPIA descartável do banco oficial (nunca a 3307).
// Uso: S09_DB_PORT=3319 S09_DB_PASSWORD=... npx tsx tests/integration/isolated-checkout.ts
import assert from 'node:assert/strict';
import { createPool, type RowDataPacket } from 'mysql2/promise';
import { transaction } from '../../src/config/mysql-transaction.js';
import { salesRepository } from '../../src/modules/sales/repository.js';
import { SALES_LOCK } from '../../src/modules/sales/routes.js';
import { salesService } from '../../src/modules/sales/service.js';
import { STOCK_LOCK } from '../../src/modules/stock/routes.js';

const port = Number(process.env.S09_DB_PORT);
if (!port || port === 3307) throw new Error('Informe a porta da instância ISOLADA (nunca 3307).');
const pool = createPool({ host: '127.0.0.1', port, user: 'supermercado_r03_app', password: process.env.S09_DB_PASSWORD,
  database: 'Supermercado', connectionLimit: 6, dateStrings: true, decimalNumbers: false });
const service = salesService({
  read: salesRepository(pool),
  write: run => transaction(pool, conn => run(salesRepository(conn)), SALES_LOCK),
  checkout: run => transaction(pool, conn => run(salesRepository(conn)), [SALES_LOCK, STOCK_LOCK]),
  verify: async () => undefined,
});
const q = async (sql: string, args: (string | number)[] = []) => (await pool.query<RowDataPacket[]>(sql, args))[0];
const counts = async () => (await q(`SELECT (SELECT COUNT(*) FROM pagamento) p,(SELECT COUNT(*) FROM movimentacao_estoque) m,
  (SELECT SUM(quantidade_atual) FROM lote) s,(SELECT COUNT(*) FROM lote WHERE quantidade_atual<0) neg`))[0];
const log = (label: string, value: unknown) => console.log('•', label, JSON.stringify(value));

try {
  const [server] = await q('SELECT @@port AS port, CURRENT_USER() AS who');
  log('instância', server);
  const before = await counts();
  log('contagens iniciais', before);

  // Cenário A — réplica da venda nº 6: dinheiro 150,00 → aplicado 130,38, troco 19,62.
  const summary = await service.paymentSummary(6, 1);
  assert.equal(summary.valor_total, '130.38');
  assert.equal(summary.itens_ativos.length, 3);
  await assert.rejects(service.finalize(6, 1, { pagamentos: [{ id_forma_pagamento: 4, valor: '130.38', valor_recebido: '150.00' }] }), /Troco/);
  await assert.rejects(service.finalize(6, 1, { pagamentos: [{ id_forma_pagamento: 1, valor: '130.37', valor_recebido: '150.00' }] }), /Saldo restante: 0.01/);
  assert.deepEqual(await counts(), before); // rejeições sem gravação parcial
  const cash = { pagamentos: [{ id_forma_pagamento: 1, valor: '130.38', valor_recebido: '150.00' }] };
  const race = await Promise.allSettled([service.finalize(6, 1, cash), service.finalize(6, 1, cash), service.finalize(6, 1, cash)]);
  log('finalizações concorrentes', race.map(r => r.status === 'fulfilled' ? 'OK' : (r.reason as Error).message));
  assert.equal(race.filter(r => r.status === 'fulfilled').length, 1);
  log('venda 6', await q('SELECT id_venda,status,valor_total FROM venda WHERE id_venda=6'));
  log('pagamentos 6', await q('SELECT id_pagamento,id_forma_pagamento,valor,valor_recebido,troco FROM pagamento WHERE id_venda=6'));
  const moves = await q(`SELECT m.id_movimentacao,m.id_item_venda,m.id_lote,m.tipo,m.quantidade,m.id_funcionario FROM movimentacao_estoque m
    JOIN item_venda i USING(id_item_venda) WHERE i.id_venda=6 ORDER BY m.id_movimentacao`);
  log('movimentações 6', moves);
  assert.deepEqual(moves.map(m => [m.id_item_venda, m.id_lote, m.tipo, m.quantidade]),
    [[11, 1, 'SAIDA_VENDA', '3.000'], [12, 3, 'SAIDA_VENDA', '2.000'], [13, 6, 'SAIDA_VENDA', '1.125']]);
  log('lotes', await q('SELECT id_lote,quantidade_inicial,quantidade_atual FROM lote WHERE id_lote IN (1,2,3,6,7) ORDER BY id_lote'));
  const after = await counts();
  assert.equal(Number(after.p), Number(before.p) + 1);
  assert.equal(Number(after.m), Number(before.m) + 3);
  assert.equal(Number(after.neg), 0);
  assert.equal((await q('SELECT data_fechamento FROM sessao_caixa WHERE id_sessao=5'))[0].data_fechamento, null);
  await assert.rejects(service.finalize(6, 1, cash), /não está aberta/);
  assert.deepEqual(await counts(), after); // repetição sem efeito
  const receipt = await service.receipt(6, 1);
  log('comprovante', { aviso: receipt.aviso, total_pago: receipt.total_pago, recebido: receipt.total_recebido, troco: receipt.troco,
    cancelados: receipt.itens.filter(i => i.situacao === 'CANCELADO').map(i => i.id_item_venda) });

  // Cenário B — múltiplos lotes (FEFO) e pagamento misto. O lote 99 é dado de teste só desta cópia.
  await q(`INSERT INTO lote (id_lote,id_produto,id_pedido,codigo_lote,data_fabricacao,data_validade,data_entrada,quantidade_inicial,quantidade_atual,custo_unitario)
    VALUES (99,1,NULL,'QA-S09-ISOLADO',NULL,'2027-01-31',CURRENT_TIMESTAMP,1.000,1.000,20.00)`);
  const open = await service.open(1);
  await service.addItem(open.id_venda, 1, { id_produto: 1, quantidade: '2' });
  await service.addItem(open.id_venda, 1, { id_produto: 6, quantidade: '0.750' });
  const mixed = await service.finalize(open.id_venda, 1, { pagamentos: [
    { id_forma_pagamento: 1, valor: '50.00', valor_recebido: '100.00' }, { id_forma_pagamento: 4, valor: '23.60' }] });
  log('venda B', { id: open.id_venda, total: mixed.valor_total, pago: mixed.total_pago, troco: mixed.troco, baixas: mixed.baixas });
  assert.equal(mixed.valor_total, '73.60'); // 2×28,90 + 0,750×21,07 = 57,80 + 15,80 (15,8025)
  assert.deepEqual(mixed.baixas.map(b => [b.id_lote, b.quantidade]), [[99, '1.000'], [1, '1.000'], [7, '0.750']]);

  // Cenário C — perda concorrente: estoque insuficiente na hora da finalização gera rollback total.
  const c = await service.open(1);
  await service.addItem(c.id_venda, 1, { id_produto: 6, quantidade: '0.850' });
  await q('UPDATE lote SET quantidade_atual=0.100 WHERE id_lote=7'); // simula perda/ajuste aplicado entre inclusão e pagamento
  const mid = await counts();
  await assert.rejects(service.finalize(c.id_venda, 1, { pagamentos: [{ id_forma_pagamento: 4, valor: '17.91' }] }), /insuficiente/);
  assert.deepEqual(await counts(), mid);
  assert.equal((await q('SELECT status FROM venda WHERE id_venda=?', [c.id_venda]))[0].status, 'ABERTA');
  log('cenário C', 'rollback sem pagamento, sem movimentação e venda ABERTA');
  console.log('ISOLADO: todos os cenários aprovados.');
} finally {
  await pool.end();
}
