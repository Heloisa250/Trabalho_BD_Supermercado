import assert from 'node:assert/strict';
import { AdminError } from '../../src/modules/admin/error.js';
import { milli } from '../../src/modules/sales/decimal.js';
import type { ItemRow, ProductRow, SaleRow, SalesRepository, SessionRow } from '../../src/modules/sales/repository.js';
import { salesService, type SalesDeps } from '../../src/modules/sales/service.js';
import type { LotRow, PaymentForm } from '../../src/modules/sales/checkout.js';

// Banco em memória que espelha as tabelas usadas pelo PDV (QA-S08).
export function fakeDatabase() {
  const state = {
    employees: new Map([[1, { ativo: true, pode: 1 }], [2, { ativo: true, pode: 1 }], [3, { ativo: true, pode: 0 }], [4, { ativo: false, pode: 0 }], [9, { ativo: true, pode: 0 }]]),
    terminals: new Map([[2, 1], [5, 0]]),
    sessions: new Map<number, { id_sessao: number; id_caixa: number; id_operador: number; data_fechamento: string | null }>([
      [3, { id_sessao: 3, id_caixa: 1, id_operador: 3, data_fechamento: null }],
      [5, { id_sessao: 5, id_caixa: 2, id_operador: 1, data_fechamento: null }],
      [6, { id_sessao: 6, id_caixa: 5, id_operador: 9, data_fechamento: null }],
    ]),
    sales: new Map<number, SaleRow>([[5, { id_venda: 5, id_sessao: 3, data_hora: '2026-11-06 15:30:00', valor_total: '38.89', status: 'ABERTA' }]]),
    items: new Map<number, { id_item_venda: number; id_venda: number; id_produto: number; quantidade: string; preco_unitario: string; subtotal: string | null }>(),
    cancellations: new Map<number, { id_item_venda: number; id_supervisor: number; motivo: string }>(),
    products: new Map<number, { id_produto: number; codigo_barras: string; nome: string; unidade_medida: 'UN' | 'KG' | 'L'; preco_venda: string; ativo: number; disponivel: string; vencido: string }>([
      [1, { id_produto: 1, codigo_barras: '7891234500011', nome: 'Arroz', unidade_medida: 'UN', preco_venda: '28.90', ativo: 1, disponivel: '97.000', vencido: '0' }],
      [5, { id_produto: 5, codigo_barras: '7891234500059', nome: 'Banana', unidade_medida: 'KG', preco_venda: '6.99', ativo: 1, disponivel: '0', vencido: '48.750' }],
      [6, { id_produto: 6, codigo_barras: '000041111026', nome: 'Queijo', unidade_medida: 'KG', preco_venda: '21.07', ativo: 1, disponivel: '2.725', vencido: '0' }],
      [7, { id_produto: 7, codigo_barras: '7890000000007', nome: 'Leite', unidade_medida: 'L', preco_venda: '4.99', ativo: 1, disponivel: '10.000', vencido: '0' }],
      [8, { id_produto: 8, codigo_barras: '7890000000008', nome: 'Inativo', unidade_medida: 'UN', preco_venda: '1.00', ativo: 0, disponivel: '5', vencido: '0' }],
    ]),
    payments: new Set<number>(), movements: new Set<number>(), failNextInsert: false, ops: 0,
    forms: [
      { id_forma_pagamento: 1, descricao: 'Dinheiro', permite_troco: 1, ativo: 1, dinheiro: 1 },
      { id_forma_pagamento: 2, descricao: 'Cartão de Débito', permite_troco: 0, ativo: 1, dinheiro: 0 },
      { id_forma_pagamento: 3, descricao: 'Cartão de Crédito', permite_troco: 0, ativo: 1, dinheiro: 0 },
      { id_forma_pagamento: 4, descricao: 'Pix', permite_troco: 0, ativo: 1, dinheiro: 0 },
      { id_forma_pagamento: 6, descricao: 'Inativa', permite_troco: 1, ativo: 0, dinheiro: 0 },
      { id_forma_pagamento: 7, descricao: 'Vale com troco', permite_troco: 1, ativo: 1, dinheiro: 0 },
    ] as PaymentForm[],
    lots: new Map<number, LotRow & { quantidade_inicial: string }>(),
    paymentRows: new Map<number, { id_venda: number; id_forma_pagamento: number; valor: string; valor_recebido: string; troco: string }>(),
    movementRows: new Map<number, { id_lote: number; id_item_venda: number; quantidade: string }>(),
    failOn: '' as string,
  };
  const failPoint = (name: string) => { if (state.failOn === name) { state.failOn = ''; throw new Error('falha simulada em ' + name); } };
  const sessionRow = (id: number): SessionRow | undefined => {
    const s = state.sessions.get(id);
    return s && { ...s, numero: s.id_caixa, caixa_ativo: state.terminals.get(s.id_caixa) ?? 1, data_abertura: '2026-11-10 12:57:16', fundo_troco: '200.00' };
  };
  const productRow = (p?: typeof state.products extends Map<number, infer V> ? V : never): ProductRow | undefined => p && { ...p, fisico: p.disponivel };
  const repo: SalesRepository = {
    async employeeActive(id) { return state.employees.get(id)?.ativo === true; },
    async supervisor(id) { const e = state.employees.get(id); return e?.ativo ? { id_funcionario: id, pode_cancelar_item: e.pode } : undefined; },
    async openSessionOf(op) { const s = [...state.sessions.values()].find(x => x.id_operador === op && x.data_fechamento === null); return s && sessionRow(s.id_sessao); },
    async session(id) { return sessionRow(id); },
    async saleSessionId(id) { return state.sales.get(id)?.id_sessao; },
    async sale(id) { const s = state.sales.get(id); return s && { ...s }; },
    async openSales(session) { return [...state.sales.values()].filter(s => s.id_sessao === session && s.status === 'ABERTA'); },
    async salesOf(op) { return [...state.sales.values()].filter(s => state.sessions.get(s.id_sessao)?.id_operador === op).map(s => ({ ...s, numero: 2 })); },
    async nextId(table) {
      state.ops++;
      await new Promise(r => setTimeout(r, 2)); // abre janela para corrida, como MAX()+1 real
      const keys = { venda: state.sales, item_venda: state.items, cancelamento_item: state.cancellations,
        pagamento: state.paymentRows, movimentacao_estoque: state.movementRows }[table].keys();
      return Math.max(0, ...keys) + 1;
    },
    async insertSale(id, session) {
      if (state.sales.has(id)) throw Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' });
      state.sales.set(id, { id_venda: id, id_sessao: session, data_hora: '2026-11-10 13:00:00', valor_total: '0.00', status: 'ABERTA' });
    },
    async productById(id) { return productRow(state.products.get(id)); },
    async productByBarcode(code) { return productRow([...state.products.values()].find(p => p.codigo_barras === code)); },
    async searchProducts(term) { return [...state.products.values()].filter(p => p.ativo && p.nome.includes(term)).map(p => productRow(p)!); },
    async items(sale) {
      return [...state.items.values()].filter(i => i.id_venda === sale).map(i => {
        const p = state.products.get(i.id_produto)!;
        const c = [...state.cancellations.entries()].find(([, x]) => x.id_item_venda === i.id_item_venda);
        return { ...i, nome: p.nome, codigo_barras: p.codigo_barras, unidade_medida: p.unidade_medida,
          id_cancelamento: c ? c[0] : null, cancelado_em: c ? '2026-11-10 13:05:00' : null, motivo: c?.[1].motivo ?? null, supervisor: c ? 'F000' + c[1].id_supervisor : null } as ItemRow;
      });
    },
    async insertItem(id, sale, product, quantidade, preco_unitario, sub) {
      if (state.failNextInsert) { state.failNextInsert = false; throw new Error('falha simulada'); }
      if (state.items.has(id)) throw Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' });
      state.items.set(id, { id_item_venda: id, id_venda: sale, id_produto: product, quantidade, preco_unitario, subtotal: sub });
    },
    async updateItem(id, quantidade, sub) { Object.assign(state.items.get(id)!, { quantidade, subtotal: sub }); },
    async insertCancellation(id, item, supervisor, motivo) {
      if (state.failNextInsert) { state.failNextInsert = false; throw new Error('falha simulada'); }
      state.cancellations.set(id, { id_item_venda: item, id_supervisor: supervisor, motivo });
    },
    async updateTotal(sale, total) { state.sales.get(sale)!.valor_total = total; },
    async cancelSale(sale) { state.sales.get(sale)!.status = 'CANCELADA'; },
    async payments(sale) { return state.payments.has(sale) || [...state.paymentRows.values()].some(p => p.id_venda === sale) ? 1 : 0; },
    async movements(sale) {
      return state.movements.has(sale) || [...state.movementRows.values()].some(m => state.items.get(m.id_item_venda)?.id_venda === sale) ? 1 : 0;
    },
    async paymentForms() { return state.forms.map(f => ({ ...f })); },
    async paymentsOf(sale) {
      return [...state.paymentRows.entries()].filter(([, p]) => p.id_venda === sale).map(([id, p]) => ({ id_pagamento: id, ...p,
        forma: state.forms.find(f => f.id_forma_pagamento === p.id_forma_pagamento)!.descricao, data_hora: '2026-11-10 14:00:00' }));
    },
    async lockLots(products) { return [...state.lots.values()].filter(l => products.includes(l.id_produto)).sort((a, b) => a.id_lote - b.id_lote).map(l => ({ ...l })); },
    async productsActive(products) { return products.map(id => ({ id_produto: id, nome: state.products.get(id)!.nome, ativo: state.products.get(id)!.ativo })); },
    async insertPayment(id, sale, form, valor, valor_recebido, troco) {
      failPoint('pagamento');
      if (state.paymentRows.has(id)) throw Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' });
      state.paymentRows.set(id, { id_venda: sale, id_forma_pagamento: form, valor, valor_recebido, troco });
    },
    async setLotBalance(lot, balance) {
      failPoint('lote');
      assert.ok(milli(balance) >= 0n, 'estoque negativo');
      state.lots.get(lot)!.quantidade_atual = balance; return 1;
    },
    async insertSaleMovement(id, lot, item, _employee, quantidade) {
      failPoint('movimentacao');
      state.movementRows.set(id, { id_lote: lot, id_item_venda: item, quantidade });
    },
    async finalizeSale(sale) { failPoint('status'); const s = state.sales.get(sale)!; if (s.status !== 'ABERTA') return 0; s.status = 'FINALIZADA'; return 1; },
    async saleMovements() { return []; },
    async operatorOf(id) { return { nome: 'Operador ' + id, matricula: 'F000' + id }; },
  };
  let queue = Promise.resolve();
  let locks = 0, releases = 0;
  // Simula GET_LOCK + transação: serializa, faz snapshot e restaura em rollback.
  const write: SalesDeps['write'] = async run => {
    const previous = queue;
    let release!: () => void;
    queue = new Promise(r => { release = r; });
    await previous; locks++;
    const snapshot = structuredClone({ sales: state.sales, items: state.items, cancellations: state.cancellations, sessions: state.sessions,
      lots: state.lots, paymentRows: state.paymentRows, movementRows: state.movementRows });
    try { return await run(repo); }
    catch (error) { Object.assign(state, snapshot); throw error; }
    finally { releases++; release(); }
  };
  const verify: SalesDeps['verify'] = async (matricula, senha) => {
    const accounts: Record<string, number> = { F0001: 1, F0002: 2, F0003: 3 };
    const id = accounts[matricula];
    if (!id || senha !== 'senha-correta-' + id) return undefined;
    return { id, permissoes: { pode_cancelar_item: state.employees.get(id)!.pode === 1 } };
  };
  return { state, repo, service: salesService({ write, checkout: write, read: repo, verify }), counters: () => ({ locks, releases }) };
}

export async function rejects(promise: Promise<unknown>, status: number, code?: string) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof AdminError, String(error));
    assert.equal(error.status, status);
    if (code) assert.equal(error.code, code);
    return true;
  });
}
