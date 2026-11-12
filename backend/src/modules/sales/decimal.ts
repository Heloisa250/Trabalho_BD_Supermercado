// Aritmética decimal exata com BigInt. Nenhum valor monetário passa por Number.
export const MAX_QUANTITY = 9999999999n; // DECIMAL(10,3) em milésimos
export const MAX_MONEY = 9999999999n; // DECIMAL(10,2) em centavos

export function scaled(value: string, scale: number) {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value).trim());
  if (!match) throw new Error('Decimal inválido.');
  const fraction = (match[3] ?? '').padEnd(scale, '0');
  if (fraction.length > scale && /[1-9]/.test(fraction.slice(scale))) throw new Error('Precisão excedida.');
  const result = BigInt(match[2]) * 10n ** BigInt(scale) + BigInt(fraction.slice(0, scale) || '0');
  return match[1] ? -result : result;
}

export function format(value: bigint, scale: number) {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(scale + 1, '0');
  return (negative ? '-' : '') + digits.slice(0, -scale) + '.' + digits.slice(-scale);
}

export const milli = (value: string) => scaled(value, 3);
export const cents = (value: string) => scaled(value, 2);
export const quantityText = (value: bigint) => format(value, 3);
export const moneyText = (value: bigint) => format(value, 2);

// quantidade (milésimos) × preço (centavos) = 1/100000 de real; arredonda meio para cima em centavos.
export function subtotal(quantity: bigint, price: bigint) {
  if (quantity < 0n || price < 0n) throw new Error('Valores negativos não são permitidos.');
  return (quantity * price + 500n) / 1000n;
}
