import assert from 'node:assert/strict';
import test from 'node:test';
import { anyDate, civilDate, dateTime, quantity, reais } from './format';

test('datas civis (DATE) não sofrem deslocamento de fuso', () => {
  assert.equal(civilDate('2026-11-10'), '10/11/2026');
  assert.equal(civilDate('2026-01-01'), '01/01/2026'); // em UTC−3, new Date('2026-01-01') viraria 31/12
  assert.equal(civilDate(null), '—');
  assert.equal(anyDate('2027-09-15'), '15/09/2027');
});

test('timestamps (DATETIME em UTC) são exibidos em America/Sao_Paulo, inclusive na virada do dia', () => {
  assert.equal(dateTime('2026-11-10 13:14:34'), '10/11/2026 10:14:34');
  assert.equal(dateTime('2026-11-11 02:30:00'), '10/11/2026 23:30:00'); // ainda dia 10 em Brasília
  assert.equal(dateTime('2026-11-11 03:00:00'), '11/11/2026 00:00:00');
  assert.equal(anyDate('2026-11-10 12:26:21'), '10/11/2026 09:26:21');
  assert.equal(dateTime(null), '—');
});

test('valores monetários e quantidades como texto exato', () => {
  assert.equal(reais('130.38'), 'R$ 130,38');
  assert.equal(reais('4355.7'), 'R$ 4.355,70');
  assert.equal(reais('1234567.89'), 'R$ 1.234.567,89');
  assert.equal(reais('-0.01'), '−R$ 0,01');
  assert.equal(reais(null), '—');
  assert.equal(quantity('3.000', 'UN'), '3 UN');
  assert.equal(quantity('1.125', 'KG'), '1,125 KG');
  assert.equal(quantity('0.750', 'L'), '0,750 L');
});
