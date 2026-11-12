import { businessDate } from '../../config/business-time.js';
import { AdminError } from '../admin/error.js';
import { cents, moneyText } from '../sales/decimal.js';

// Convenção de fuso: o MySQL grava DATETIME em UTC. Os relatórios apresentam e agrupam no horário de
// Brasília (UTC−3, sem horário de verão desde 2019). O deslocamento é fixo para não depender das tabelas
// de fuso do MySQL (CONVERT_TZ com nomes de região exige tabelas que o container não carrega).
export const PRESENTATION_OFFSET_HOURS = -3;
export const MAX_RANGE_DAYS = 366;

const DAY = 86_400_000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const utcStamp = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

// "Hoje" = data comercial única do sistema (config/business-time.ts), a mesma usada pelo Estoque e pelo PDV.
export function localToday(now = Date.now()) {
  return businessDate(now);
}

export function addDays(day: string, days: number) {
  return isoDay(Date.parse(day + 'T00:00:00Z') + days * DAY);
}

// inicio e fim são datas locais INCLUSIVAS. A consulta usa o intervalo UTC semiaberto [desde, ate).
export function period(inicio: string | undefined, fim: string | undefined, now = Date.now()) {
  const end = fim ?? localToday(now);
  const start = inicio ?? addDays(end, -29);
  if (start > end) throw new AdminError(400, 'INVALID_PERIOD', 'A data inicial deve ser anterior ou igual à final.');
  const days = (Date.parse(end) - Date.parse(start)) / DAY + 1;
  if (days > MAX_RANGE_DAYS) throw new AdminError(400, 'INVALID_PERIOD', 'O período máximo é de ' + MAX_RANGE_DAYS + ' dias.');
  const shift = -PRESENTATION_OFFSET_HOURS * 3_600_000;
  return { inicio: start, fim: end, dias: days,
    desde: utcStamp(Date.parse(start + 'T00:00:00Z') + shift),
    ate: utcStamp(Date.parse(addDays(end, 1) + 'T00:00:00Z') + shift) };
}

export type Grouping = 'dia' | 'semana' | 'mes';

// Chave do intervalo para uma data local (semana começa na segunda-feira; mês no dia 1).
export function bucketOf(day: string, grouping: Grouping) {
  if (grouping === 'dia') return day;
  if (grouping === 'mes') return day.slice(0, 8) + '01';
  const weekday = (new Date(day + 'T00:00:00Z').getUTCDay() + 6) % 7;
  return addDays(day, -weekday);
}

// Expressão SQL equivalente a bucketOf, aplicada à data local da venda. Só valores da allowlist chegam aqui.
export function bucketSql(column: string, grouping: Grouping) {
  const local = `DATE(DATE_ADD(${column}, INTERVAL ${PRESENTATION_OFFSET_HOURS} HOUR))`;
  return { dia: local, semana: `DATE_SUB(${local}, INTERVAL WEEKDAY(${local}) DAY)`, mes: `DATE_FORMAT(${local}, '%Y-%m-01')` }[grouping];
}

// Preenche os intervalos sem vendas com zero e os marca (sem_registro), sem inventar valores.
export function fillSeries(rows: readonly { periodo: string; vendas: number; faturamento: string }[], start: string, end: string, grouping: Grouping) {
  const found = new Map(rows.map(row => [String(row.periodo).slice(0, 10), row]));
  const out: { periodo: string; vendas: number; faturamento: string; sem_registro: boolean }[] = [];
  for (let key = bucketOf(start, grouping); key <= end; ) {
    const row = found.get(key);
    out.push(row ? { periodo: key, vendas: Number(row.vendas), faturamento: moneyText(cents(String(row.faturamento))), sem_registro: false }
      : { periodo: key, vendas: 0, faturamento: '0.00', sem_registro: true });
    key = grouping === 'dia' ? addDays(key, 1) : grouping === 'semana' ? addDays(key, 7)
      : bucketOf(addDays(key.slice(0, 8) + '28', 4), 'mes');
  }
  return out;
}

// Ticket médio = faturamento / vendas finalizadas, arredondado meio-para-cima em centavos; 0 vendas → null.
export function averageTicket(revenue: string, sales: number) {
  if (!sales) return null;
  const total = cents(revenue);
  return moneyText((total * 2n + BigInt(sales)) / (2n * BigInt(sales)));
}

export const sumMoney = (values: readonly (string | null)[]) => moneyText(values.reduce((sum, value) => sum + cents(value ?? '0'), 0n));
