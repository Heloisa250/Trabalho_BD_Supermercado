// Regra temporal única do sistema (Script 11).
//
// - Timestamps operacionais (DATETIME: venda, pagamento, movimentação, sessão…) continuam gravados em UTC
//   via CURRENT_TIMESTAMP do MySQL, que roda em UTC.
// - Datas civis (DATE: validade, fabricação, demissão, data prevista) são comparadas com a DATA COMERCIAL,
//   isto é, o dia corrente em America/Sao_Paulo. Nunca com CURRENT_DATE do MySQL (UTC), que adianta o dia
//   entre 21h e 24h de Brasília.
// - Valores DATE são tratados como texto YYYY-MM-DD, sem conversão de fuso.
export const BUSINESS_TIME_ZONE = 'America/Sao_Paulo';

const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

// Data comercial (YYYY-MM-DD) no instante informado.
export function businessDate(now: Date | number = Date.now()) {
  return formatter.format(typeof now === 'number' ? new Date(now) : now);
}

// Literal SQL da data comercial. O valor é gerado pelo servidor e validado; nunca vem do cliente.
export function sqlBusinessDate(now: Date | number = Date.now()) {
  const day = businessDate(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Data comercial inválida.');
  return `DATE '${day}'`;
}

// Diferença de horas entre America/Sao_Paulo e UTC no instante (−3 desde o fim do horário de verão em 2019).
export function businessOffsetHours(now: Date | number = Date.now()) {
  const date = typeof now === 'number' ? new Date(now) : now;
  const local = new Date(date.toLocaleString('en-US', { timeZone: BUSINESS_TIME_ZONE }));
  const utc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  return Math.round((local.getTime() - utc.getTime()) / 3_600_000);
}
