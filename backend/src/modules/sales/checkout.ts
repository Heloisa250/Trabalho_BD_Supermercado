import { AdminError } from '../admin/error.js';
import { cents, MAX_MONEY, milli, moneyText, quantityText } from './decimal.js';

const fail = (status: number, code: string, message: string) => new AdminError(status, code, message);

export type PaymentForm = { id_forma_pagamento: number; descricao: string; permite_troco: number; ativo: number; dinheiro: number };
export type PaymentInput = { id_forma_pagamento: number; valor: string; valor_recebido?: string };
export type PaymentPlan = { id_forma_pagamento: number; valor: string; valor_recebido: string; troco: string };

// Contrato financeiro (centavos inteiros):
//   valor          = quanto do total da venda esta forma quita (> 0).
//   valor_recebido = quanto o cliente entregou. Dinheiro físico: >= valor. Demais formas: igual a valor.
//   troco          = valor_recebido - valor. Só pode ser > 0 em dinheiro físico com permite_troco = 1.
// Invariantes: soma(valor) = total da venda; valor_recebido - troco = valor em cada pagamento.
export function planPayments(total: bigint, forms: readonly PaymentForm[], input: readonly PaymentInput[]): PaymentPlan[] {
  if (total <= 0n) throw fail(409, 'EMPTY_SALE', 'A venda não possui itens ativos para pagamento.');
  const byId = new Map(forms.map(form => [form.id_forma_pagamento, form]));
  const used = new Set<number>();
  let remaining = total;
  const plans = input.map(payment => {
    const form = byId.get(payment.id_forma_pagamento);
    if (!form) throw fail(404, 'PAYMENT_FORM_NOT_FOUND', 'Forma de pagamento inexistente.');
    if (form.ativo !== 1) throw fail(409, 'PAYMENT_FORM_INACTIVE', 'Forma de pagamento inativa: ' + form.descricao + '.');
    if (used.has(form.id_forma_pagamento)) throw fail(400, 'DUPLICATE_PAYMENT_FORM', 'Cada forma de pagamento pode aparecer uma única vez.');
    used.add(form.id_forma_pagamento);
    const value = cents(payment.valor);
    if (value <= 0n) throw fail(400, 'INVALID_PAYMENT', 'O valor de cada pagamento deve ser maior que zero.');
    if (value > remaining) throw fail(409, 'PAYMENT_EXCEEDS_BALANCE', 'O pagamento em ' + form.descricao + ' excede o saldo restante.');
    remaining -= value;
    const cash = form.dinheiro === 1 && form.permite_troco === 1;
    const received = payment.valor_recebido === undefined ? value : cents(payment.valor_recebido);
    if (received > MAX_MONEY) throw fail(400, 'INVALID_PAYMENT', 'Valor recebido acima do limite.');
    if (received < value) throw fail(409, 'INSUFFICIENT_CASH', 'O valor recebido é menor que o valor aplicado.');
    if (received !== value && !cash) throw fail(409, 'CHANGE_NOT_ALLOWED', 'Troco só é permitido em dinheiro físico (' + form.descricao + ' não aceita).');
    return { id_forma_pagamento: form.id_forma_pagamento, valor: moneyText(value), valor_recebido: moneyText(received), troco: moneyText(received - value) };
  });
  if (remaining !== 0n) throw fail(409, 'PAYMENT_INCOMPLETE', 'Os pagamentos não cobrem o total. Saldo restante: ' + moneyText(remaining) + '.');
  return plans;
}

export type LotRow = { id_lote: number; id_produto: number; data_validade: string | null; data_entrada: string; quantidade_atual: string; vencido: number };
export type SaleLine = { id_item_venda: number; id_produto: number; quantidade: string; nome: string };
export type Withdrawal = { id_item_venda: number; id_lote: number; quantidade: string; saldo_final: string };

// FEFO: lotes com validade mais próxima primeiro; lotes sem validade por último (não vencem, então
// ficam para depois dos perecíveis). Desempate por data de entrada e depois id_lote. Lotes vencidos
// ou sem saldo nunca são usados. Itens são processados em ordem de id_item_venda.
export function fefoOrder(a: LotRow, b: LotRow) {
  if (a.data_validade !== b.data_validade) {
    if (a.data_validade === null) return 1;
    if (b.data_validade === null) return -1;
    return a.data_validade < b.data_validade ? -1 : 1;
  }
  if (a.data_entrada !== b.data_entrada) return a.data_entrada < b.data_entrada ? -1 : 1;
  return a.id_lote - b.id_lote;
}

export function allocateFefo(lines: readonly SaleLine[], lots: readonly LotRow[]): Withdrawal[] {
  const balance = new Map(lots.map(lot => [lot.id_lote, milli(String(lot.quantidade_atual))]));
  const eligible = lots.filter(lot => lot.vencido !== 1 && milli(String(lot.quantidade_atual)) > 0n).sort(fefoOrder);
  const result: Withdrawal[] = [];
  for (const line of [...lines].sort((a, b) => a.id_item_venda - b.id_item_venda)) {
    let needed = milli(line.quantidade);
    for (const lot of eligible) {
      if (needed === 0n) break;
      if (lot.id_produto !== line.id_produto) continue;
      const available = balance.get(lot.id_lote)!;
      if (available <= 0n) continue;
      const take = available < needed ? available : needed;
      balance.set(lot.id_lote, available - take);
      needed -= take;
      result.push({ id_item_venda: line.id_item_venda, id_lote: lot.id_lote, quantidade: quantityText(take), saldo_final: quantityText(available - take) });
    }
    if (needed > 0n) throw fail(409, 'INSUFFICIENT_STOCK', 'Estoque vendável insuficiente para ' + line.nome + ' (faltam ' + quantityText(needed) + ').');
  }
  return result;
}
