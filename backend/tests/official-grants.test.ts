import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateOfficialGrants } from '../src/config/official-grants.js';

const user = 'supermercado_r03_app';
const to = ' TO `supermercado_r03_app`@`%`';
const grants = [
  'GRANT USAGE ON *.*', 'GRANT SELECT ON `Supermercado`.*',
  ...['caixa', 'cargo', 'categoria', 'forma_pagamento', 'fornecedor', 'funcionario',
    'item_pedido_compra', 'item_venda', 'lote', 'marca', 'pedido_compra',
    'produto', 'produto_fornecedor', 'sessao_caixa', 'venda']
    .map(table => `GRANT INSERT, UPDATE ON \`Supermercado\`.\`${table}\``),
  'GRANT INSERT ON `Supermercado`.`cancelamento_item`',
  'GRANT INSERT ON `Supermercado`.`movimentacao_estoque`',
  'GRANT INSERT ON `Supermercado`.`pagamento`',
].map(grant => grant + to);

test('aceita a matriz oficial com ordem, agrupamento e aspas equivalentes', () => {
  validateOfficialGrants(user, grants);
  validateOfficialGrants(user, grants.flatMap(grant => grant.includes('INSERT, UPDATE')
    ? ['insert', 'update'].map(privilege => grant.replace('INSERT, UPDATE', privilege).replaceAll('`', ''))
    : [grant]).reverse());
  validateOfficialGrants('supermercado_r01', ["GRANT SELECT ON Supermercado.* TO 'supermercado_r01'@'%'"]);
});

test('rejeita grants ausentes, escopos amplos, escrita histórica e concessões indiretas', () => {
  assert.throws(() => validateOfficialGrants(user, grants.slice(0, -1)), /ausentes: 1/);
  for (const excess of [
    'GRANT UPDATE ON Supermercado.pagamento' + to,
    'GRANT UPDATE ON Supermercado.movimentacao_estoque' + to,
    'GRANT INSERT ON Supermercado.*' + to,
    'GRANT SELECT ON *.*' + to,
    'GRANT DELETE, CREATE, ALTER, DROP ON Supermercado.*' + to,
    'GRANT SELECT ON Supermercado.*' + to + ' WITH GRANT OPTION',
    'GRANT `writer`@`%`' + to,
  ]) {
    assert.throws(() => validateOfficialGrants(user, [...grants, excess]));
  }
  assert.throws(() => validateOfficialGrants('supermercado_r01', [
    'GRANT SELECT ON Supermercado.* TO supermercado_r01@%',
    'GRANT INSERT ON Supermercado.caixa TO supermercado_r01@%',
  ]), /excessivos: 1/);
});
