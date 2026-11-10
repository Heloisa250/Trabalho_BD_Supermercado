// Formatação única da interface (Script 11). Mesma regra temporal do back-end (config/business-time.ts):
// - DATE (validade, fabricação, data prevista): texto YYYY-MM-DD exibido como DD/MM/AAAA, SEM conversão de fuso.
// - DATETIME (venda, pagamento, movimentação, sessão): gravado em UTC, exibido em America/Sao_Paulo.
export const BUSINESS_TIME_ZONE = 'America/Sao_Paulo';

const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: BUSINESS_TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function civilDate(value: string | null | undefined) {
  if (!value) return '—';
  const day = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day.split('-').reverse().join('/') : String(value);
}

export function dateTime(utc: string | null | undefined) {
  if (!utc) return '—';
  const text = String(utc).replace(' ', 'T');
  const instant = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(text) ? text : text + 'Z');
  return Number.isNaN(instant.getTime()) ? String(utc) : dateTimeFormat.format(instant).replace(',', '');
}

// Coluna DATETIME tem horário; DATE não. Usado por tabelas genéricas.
export const anyDate = (value: string | null | undefined) => value && String(value).length > 10 ? dateTime(value) : civilDate(value);

export function reais(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return '—';
  const [whole, fraction = ''] = String(value).split('.');
  const negative = whole.startsWith('-');
  return (negative ? '−' : '') + 'R$ ' + whole.replace('-', '').replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + fraction.padEnd(2, '0').slice(0, 2);
}

// Quantidade DECIMAL(10,3) como texto: UN sem casas, KG/L com vírgula. Nunca converte para Number.
export function quantity(value: string | null | undefined, unit?: string) {
  if (value === null || value === undefined) return '—';
  const text = unit === 'UN' ? String(value).replace(/\.0+$/, '') : String(value).replace('.', ',');
  return unit ? text + ' ' + unit : text;
}
