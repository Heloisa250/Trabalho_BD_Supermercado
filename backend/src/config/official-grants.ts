const writableTables = [
  'funcionario', 'cargo', 'caixa', 'forma_pagamento',
  'categoria', 'marca', 'produto', 'fornecedor', 'produto_fornecedor',
  'pedido_compra', 'item_pedido_compra', 'lote', 'sessao_caixa', 'venda', 'item_venda',
];

const insertOnlyTables = ['movimentacao_estoque', 'cancelamento_item', 'pagamento'];

export function validateOfficialGrants(user: string, grants: readonly string[]) {
  if (user !== 'supermercado_r01' && user !== 'supermercado_r03_app') {
    throw new Error('Conta fora dos perfis oficiais.');
  }

  const expected = new Set(['SELECT ON Supermercado.*']);
  if (user === 'supermercado_r03_app') {
    for (const table of writableTables) {
      expected.add(`INSERT ON Supermercado.${table}`);
      expected.add(`UPDATE ON Supermercado.${table}`);
    }
    for (const table of insertOnlyTables) expected.add(`INSERT ON Supermercado.${table}`);
  }

  const actual = new Set<string>();
  const grantPattern = new RegExp(
    '^GRANT\\s+([A-Z_,\\s]+?)\\s+ON\\s+(\\*|`\\w+`|\\w+)\\s*\\.\\s*(\\*|`\\w+`|\\w+)' +
    `\\s+TO\\s+(?:\`${user}\`|'${user}'|${user})\\s*@\\s*(?:\`%\`|'%'|%)$`, 'i',
  );
  for (const statement of grants) {
    const match = grantPattern.exec(statement.trim());
    // Roles, column grants, proxy grants and grant options are outside these profiles.
    if (!match) throw new Error('SHOW GRANTS retornou uma concessão fora do perfil oficial.');
    const [, privileges, schema, object] = match;
    const scope = `${schema}.${object}`.replaceAll('`', '');
    for (const privilege of privileges.toUpperCase().split(',').map(value => value.trim())) {
      if (privilege === 'USAGE' && scope === '*.*') continue;
      actual.add(`${privilege} ON ${scope}`);
    }
  }

  const missing = [...expected].filter(grant => !actual.has(grant));
  const excess = [...actual].filter(grant => !expected.has(grant));
  if (missing.length || excess.length) {
    throw new Error(`Privilégios divergentes (ausentes: ${missing.length}, excessivos: ${excess.length}).`);
  }
}
