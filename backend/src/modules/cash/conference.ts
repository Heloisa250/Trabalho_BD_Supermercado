// Regra única de dinheiro físico (Script 07), reutilizada pela finalização (Script 09). fp = forma_pagamento.
export const CASH_FORM_SQL = "BINARY LOWER(TRIM(fp.descricao))=BINARY 'dinheiro'";

export type SalePayment = {
  id_venda: number; status: string; valor_total: string; id_pagamento: number | null;
  valor: string | null; valor_recebido: string | null; troco: string | null; dinheiro: number | null;
};

function cents(value: string) {
  const [whole, fraction = ''] = value.split('.');
  const absolute = BigInt(whole.replace('-', '')) * 100n + BigInt(fraction.padEnd(2,'0'));
  return value.startsWith('-') ? -absolute : absolute;
}

function decimal(value: bigint) {
  const digits = (value < 0n ? -value : value).toString().padStart(3,'0');
  return (value < 0n ? '-' : '') + digits.slice(0,-2) + '.' + digits.slice(-2);
}

export function cashConference(fund: string, counted: string | null, rows: readonly SalePayment[]) {
  let cash = 0n;
  const open = new Set<number>();
  const sales = new Map<number,{ expected: bigint; applied: bigint }>();
  const divergencias: { id_pagamento: number; aplicado: string; liquido: string | null }[] = [];
  for (const row of rows) {
    if (row.status === 'ABERTA') open.add(row.id_venda);
    if (row.status !== 'FINALIZADA') continue;
    const sale = sales.get(row.id_venda) ?? { expected: cents(row.valor_total), applied: 0n };
    sales.set(row.id_venda,sale);
    if (row.id_pagamento === null || row.valor === null) continue;
    const applied = cents(row.valor);
    sale.applied += applied;
    if (row.dinheiro !== 1) continue;
    const net = row.valor_recebido === null ? null : cents(row.valor_recebido) - cents(row.troco ?? '0');
    if ((net !== null && net !== applied) || (net === null && cents(row.troco ?? '0') !== 0n) || applied < 0n) {
      divergencias.push({ id_pagamento: row.id_pagamento, aplicado: row.valor, liquido: net === null ? null : decimal(net) });
    }
    cash += applied;
  }
  const expected = cents(fund) + cash;
  const difference = counted === null ? null : cents(counted) - expected;
  return { recebido_dinheiro: decimal(cash), valor_esperado: decimal(expected),
    diferenca: difference === null ? null : decimal(difference),
    resultado: difference === null ? null : difference === 0n ? 'CONFERIDO' : difference < 0n ? 'FALTA' : 'SOBRA',
    vendas_abertas: open.size, vendas_pendentes: [...sales.values()].filter(sale => sale.applied !== sale.expected).length, divergencias };
}
