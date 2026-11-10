import assert from 'node:assert/strict';
import test from 'node:test';
import { businessDate, businessOffsetHours, sqlBusinessDate } from '../src/config/business-time.js';
import { localToday, period, PRESENTATION_OFFSET_HOURS } from '../src/modules/dashboard/period.js';
import { allocateFefo } from '../src/modules/sales/checkout.js';

test('data comercial em America/Sao_Paulo na virada do dia', () => {
  // 23:59:59 de 10/11 em Brasília = 02:59:59 UTC de 11/11: o MySQL (UTC) já diria 11/11.
  assert.equal(businessDate(Date.parse('2026-11-11T02:59:59Z')), '2026-11-10');
  assert.equal(businessDate(Date.parse('2026-11-11T03:00:00Z')), '2026-11-11'); // 00:00 em Brasília
  assert.equal(businessDate(Date.parse('2026-11-10T21:30:00Z')), '2026-11-10'); // 18:30 em Brasília
  assert.equal(businessDate(Date.parse('2026-12-31T23:30:00Z')), '2026-12-31'); // virada de ano local ainda não ocorreu
  assert.equal(sqlBusinessDate(Date.parse('2026-11-11T02:00:00Z')), "DATE '2026-11-10'");
});

test('dashboard e estoque usam a mesma data comercial; deslocamento de apresentação confere com o fuso', () => {
  for (const instant of ['2026-11-11T00:30:00Z', '2026-11-11T02:59:59Z', '2026-11-11T03:00:01Z', '2026-06-15T12:00:00Z']) {
    const now = Date.parse(instant);
    assert.equal(localToday(now), businessDate(now), instant); // dashboard === estoque/PDV (sqlBusinessDate)
    assert.equal(businessOffsetHours(now), PRESENTATION_OFFSET_HOURS, instant); // agrupamento SQL do dashboard
  }
  // período padrão às 22:00 de Brasília termina no dia local, não no dia UTC seguinte
  assert.equal(period(undefined, undefined, Date.parse('2026-11-11T01:00:00Z')).fim, '2026-11-10');
});

test('datas DATE (validade e fabricação) não sofrem deslocamento', () => {
  // Validade é comparada como texto YYYY-MM-DD: um lote que vence em 10/11 continua elegível em 10/11 local.
  const lot = (data_validade: string, vencido: number) => ({ id_lote: 1, id_produto: 1, quantidade_atual: '1.000', data_validade, data_entrada: '2026-11-01 00:00:00', vencido });
  const today = businessDate(Date.parse('2026-11-11T02:30:00Z')); // 23:30 de 10/11 em Brasília
  assert.equal(today, '2026-11-10');
  const expired = '2026-11-10' < today ? 1 : 0; // mesma regra do SQL: data_validade < data comercial
  assert.equal(expired, 0);
  assert.equal(allocateFefo([{ id_item_venda: 1, id_produto: 1, quantidade: '1', nome: 'X' }], [lot('2026-11-10', expired)]).length, 1);
  assert.throws(() => allocateFefo([{ id_item_venda: 1, id_produto: 1, quantidade: '1', nome: 'X' }], [lot('2026-11-09', 1)]), /insuficiente/);
});
