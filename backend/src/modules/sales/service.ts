import { AdminError } from '../admin/error.js';
import { cents, MAX_MONEY, MAX_QUANTITY, milli, moneyText, quantityText, subtotal } from './decimal.js';
import type { ItemRow, ProductRow, SaleRow, SalesRepository, SessionRow } from './repository.js';
import { allocateFefo, planPayments, type PaymentInput } from './checkout.js';

export type SalesDeps = {
  // Executa a operação numa transação serializada pelo lock nomeado do PDV.
  write: <T>(run: (repo: SalesRepository) => Promise<T>) => Promise<T>;
  // Finalização: lock do PDV e, em seguida, lock do estoque (ordem global fixa).
  checkout: <T>(run: (repo: SalesRepository) => Promise<T>) => Promise<T>;
  read: SalesRepository;
  // Confirma matrícula e senha (bcrypt) do supervisor; nunca recebe ID do cliente.
  verify: (matricula: string, senha: string) => Promise<{ id: number; permissoes: { pode_cancelar_item: boolean } } | undefined>;
};

const fail = (status: number, code: string, message: string) => new AdminError(status, code, message);

function product(row: ProductRow) {
  return { id_produto: row.id_produto, codigo_barras: row.codigo_barras, nome: row.nome, unidade_medida: row.unidade_medida,
    preco_venda: row.preco_venda, ativo: row.ativo === 1, disponivel: quantityText(milli(String(row.disponivel))),
    vencido: quantityText(milli(String(row.vencido))) };
}

function item(row: ItemRow) {
  return { id_item_venda: row.id_item_venda, id_produto: row.id_produto, nome: row.nome, codigo_barras: row.codigo_barras,
    unidade_medida: row.unidade_medida, quantidade: row.quantidade, preco_unitario: row.preco_unitario, subtotal: row.subtotal,
    situacao: row.id_cancelamento === null ? 'ATIVO' as const : 'CANCELADO' as const,
    cancelamento: row.id_cancelamento === null ? null
      : { id_cancelamento: row.id_cancelamento, data_hora: row.cancelado_em, motivo: row.motivo, supervisor: row.supervisor } };
}

function lineTotal(row: ItemRow) {
  return row.subtotal === null ? subtotal(milli(row.quantidade), cents(row.preco_unitario)) : cents(row.subtotal);
}

// Total = soma dos subtotais dos itens sem registro em cancelamento_item.
export function saleTotal(rows: readonly ItemRow[]) {
  const total = rows.filter(row => row.id_cancelamento === null).reduce((sum, row) => sum + lineTotal(row), 0n);
  if (total > MAX_MONEY) throw fail(409, 'TOTAL_LIMIT', 'O total excede o limite permitido para a venda.');
  return total;
}

export function validateQuantity(unit: string, value: string) {
  const amount = milli(value);
  if (amount <= 0n) throw fail(400, 'INVALID_QUANTITY', 'A quantidade deve ser maior que zero.');
  if (amount > MAX_QUANTITY) throw fail(400, 'INVALID_QUANTITY', 'Quantidade acima do limite.');
  if (unit === 'UN' && amount % 1000n !== 0n) throw fail(400, 'INVALID_QUANTITY', 'Produtos vendidos por unidade exigem quantidade inteira.');
  return amount;
}

export function salesService({ write, checkout, read, verify }: SalesDeps) {
  async function view(repo: SalesRepository, sale: SaleRow, session?: SessionRow) {
    const current = session ?? await repo.session(sale.id_sessao);
    const rows = await repo.items(sale.id_venda);
    return { ...sale, numero_caixa: current?.numero ?? null, id_caixa: current?.id_caixa ?? null,
      itens: rows.map(item), itens_ativos: rows.filter(row => row.id_cancelamento === null).length };
  }

  // Sessão → venda: guarda comum a todas as escritas de itens e da venda.
  async function lockOwnSale(repo: SalesRepository, saleId: number, operator: number) {
    const sessionId = await repo.saleSessionId(saleId);
    if (sessionId === undefined) throw fail(404, 'NOT_FOUND', 'Venda não encontrada.');
    const session = await repo.session(sessionId, true);
    if (!session || session.id_operador !== operator) throw fail(403, 'FORBIDDEN', 'Venda de outro operador.');
    if (!await repo.employeeActive(operator)) throw fail(403, 'INACTIVE_OPERATOR', 'Operador indisponível.');
    if (session.data_fechamento !== null) throw fail(409, 'SESSION_CLOSED', 'A sessão de caixa desta venda está fechada.');
    if (session.caixa_ativo !== 1) throw fail(409, 'INACTIVE_TERMINAL', 'Terminal inativo.');
    const sale = (await repo.sale(saleId, true))!;
    if (sale.status !== 'ABERTA') throw fail(409, 'SALE_NOT_OPEN', 'A venda não está aberta.');
    return { session, sale };
  }

  async function ownSale(repo: SalesRepository, saleId: number, operator: number) {
    const sale = await repo.sale(saleId);
    if (!sale) throw fail(404, 'NOT_FOUND', 'Venda não encontrada.');
    const session = await repo.session(sale.id_sessao);
    if (!session || session.id_operador !== operator) throw fail(403, 'FORBIDDEN', 'Venda de outro operador.');
    return { sale, session };
  }

  function checkStock(row: ProductRow, wanted: bigint) {
    if (row.ativo !== 1) throw fail(409, 'INACTIVE_PRODUCT', 'Produto inativo.');
    const available = milli(String(row.disponivel));
    if (wanted > available) {
      throw fail(409, 'INSUFFICIENT_STOCK', 'Estoque vendável insuficiente (disponível: ' + quantityText(available) + ' ' + row.unidade_medida + ').');
    }
  }

  async function persistTotal(repo: SalesRepository, sale: SaleRow) {
    const rows = await repo.items(sale.id_venda);
    const total = moneyText(saleTotal(rows));
    await repo.updateTotal(sale.id_venda, total);
    return { ...sale, valor_total: total };
  }

  async function receipt(repo: SalesRepository, sale: SaleRow, session: SessionRow) {
    const [rows, payments, operator] = await Promise.all([repo.items(sale.id_venda), repo.paymentsOf(sale.id_venda), repo.operatorOf(session.id_operador)]);
    const sum = (key: 'valor' | 'valor_recebido' | 'troco') => moneyText(payments.reduce((total, row) => total + cents(row[key] ?? '0'), 0n));
    return { aviso: 'COMPROVANTE DEMONSTRATIVO — SEM VALOR FISCAL', supermercado: 'Supermercado Qualidade Líder',
      id_venda: sale.id_venda, status: sale.status, data_hora: sale.data_hora, id_sessao: session.id_sessao, numero_caixa: session.numero,
      operador: operator ? { nome: operator.nome, matricula: operator.matricula } : null,
      itens: rows.map(item), valor_total: sale.valor_total,
      pagamentos: payments, total_pago: sum('valor'), total_recebido: sum('valor_recebido'), troco: sum('troco') };
  }

  return {
    async paymentSummary(saleId: number, operator: number) {
      const { sale, session } = await ownSale(read, saleId, operator);
      const [rows, forms, payments] = await Promise.all([read.items(sale.id_venda), read.paymentForms(), read.paymentsOf(sale.id_venda)]);
      const total = saleTotal(rows);
      const paid = payments.reduce((sum, row) => sum + cents(row.valor), 0n);
      return { id_venda: sale.id_venda, status: sale.status, numero_caixa: session.numero, valor_total: moneyText(total),
        valor_registrado: sale.valor_total, itens_ativos: rows.filter(row => row.id_cancelamento === null).map(item),
        formas: forms.filter(form => form.ativo === 1).map(form => ({ id_forma_pagamento: form.id_forma_pagamento, descricao: form.descricao,
          permite_troco: form.permite_troco === 1 && form.dinheiro === 1 })),
        pagamentos: payments, total_pago: moneyText(paid), saldo: moneyText(total - paid) };
    },
    async payments(saleId: number, operator: number) {
      const { sale } = await ownSale(read, saleId, operator);
      return read.paymentsOf(sale.id_venda);
    },
    async receipt(saleId: number, operator: number) {
      const { sale, session } = await ownSale(read, saleId, operator);
      if (sale.status !== 'FINALIZADA') throw fail(409, 'SALE_NOT_FINALIZED', 'O comprovante só existe para vendas finalizadas.');
      return receipt(read, sale, session);
    },
    // Uma única transação: pagamentos + baixa FEFO + SAIDA_VENDA + status. Qualquer erro desfaz tudo.
    finalize(saleId: number, operator: number, input: { pagamentos: PaymentInput[] }) {
      return checkout(async repo => {
        const { session, sale } = await lockOwnSale(repo, saleId, operator);
        const rows = await repo.items(sale.id_venda, true);
        const active = rows.filter(row => row.id_cancelamento === null);
        if (!active.length) throw fail(409, 'EMPTY_SALE', 'A venda não possui itens ativos.');
        const total = saleTotal(rows);
        if (total !== cents(sale.valor_total)) throw fail(409, 'TOTAL_MISMATCH', 'O total gravado diverge dos itens ativos. Revise a venda.');
        if (await repo.payments(sale.id_venda)) throw fail(409, 'SALE_HAS_PAYMENTS', 'A venda já possui pagamentos registrados.');
        if (await repo.movements(sale.id_venda)) throw fail(409, 'SALE_HAS_MOVEMENTS', 'A venda já possui movimentações de estoque.');
        const plans = planPayments(total, await repo.paymentForms(), input.pagamentos);
        const products = [...new Set(active.map(row => row.id_produto))].sort((a, b) => a - b);
        const inactive = (await repo.productsActive(products)).find(product => product.ativo !== 1);
        if (inactive) throw fail(409, 'INACTIVE_PRODUCT', 'Produto inativo na venda: ' + inactive.nome + '.');
        const withdrawals = allocateFefo(active, await repo.lockLots(products));
        for (const plan of plans) {
          await repo.insertPayment(await repo.nextId('pagamento', 'id_pagamento'), sale.id_venda, plan.id_forma_pagamento, plan.valor, plan.valor_recebido, plan.troco);
        }
        for (const out of withdrawals) {
          if (await repo.setLotBalance(out.id_lote, out.saldo_final) !== 1) throw fail(409, 'CONCURRENT_UPDATE', 'Lote alterado durante a finalização.');
          await repo.insertSaleMovement(await repo.nextId('movimentacao_estoque', 'id_movimentacao'), out.id_lote, out.id_item_venda, operator, out.quantidade, 'Venda #' + sale.id_venda);
        }
        if (await repo.finalizeSale(sale.id_venda) !== 1) throw fail(409, 'SALE_NOT_OPEN', 'A venda não está aberta.');
        return { ...await receipt(repo, { ...sale, status: 'FINALIZADA' }, session), baixas: withdrawals };
      });
    },
    async active(operator: number) {
      const session = await read.openSessionOf(operator);
      if (!session) return { sessao: null, venda: null };
      const [sale] = await read.openSales(session.id_sessao);
      return { sessao: { id_sessao: session.id_sessao, id_caixa: session.id_caixa, numero_caixa: session.numero,
        caixa_ativo: session.caixa_ativo === 1, data_abertura: session.data_abertura },
      venda: sale ? await view(read, sale, session) : null };
    },
    async list(operator: number, status: string | null, page: number) {
      const rows = await read.salesOf(operator, status, (page - 1) * 20, 21);
      return { items: rows.slice(0, 20), pagina: page, mais: rows.length > 20 };
    },
    async detail(saleId: number, operator: number) {
      const { sale, session } = await ownSale(read, saleId, operator);
      return view(read, sale, session);
    },
    async items(saleId: number, operator: number) {
      const { sale } = await ownSale(read, saleId, operator);
      return (await read.items(sale.id_venda)).map(item);
    },
    async lookup(term: { codigo_barras?: string; busca?: string }) {
      if (term.codigo_barras !== undefined) {
        const row = await read.productByBarcode(term.codigo_barras);
        if (!row) throw fail(404, 'PRODUCT_NOT_FOUND', 'Produto não encontrado para o código informado.');
        return [product(row)];
      }
      return (await read.searchProducts(term.busca ?? '')).map(product);
    },
    open(operator: number) {
      return write(async repo => {
        if (!await repo.employeeActive(operator)) throw fail(403, 'INACTIVE_OPERATOR', 'Operador indisponível.');
        const found = await repo.openSessionOf(operator);
        if (!found) throw fail(409, 'NO_OPEN_SESSION', 'Abra uma sessão de caixa antes de iniciar uma venda.');
        const session = await repo.session(found.id_sessao, true);
        if (!session || session.id_operador !== operator) throw fail(403, 'FORBIDDEN', 'Sessão de outro operador.');
        if (session.data_fechamento !== null) throw fail(409, 'SESSION_CLOSED', 'A sessão de caixa está fechada.');
        if (session.caixa_ativo !== 1) throw fail(409, 'INACTIVE_TERMINAL', 'Terminal inativo.');
        if ((await repo.openSales(session.id_sessao, true)).length) throw fail(409, 'SALE_ALREADY_OPEN', 'Já existe uma venda aberta nesta sessão.');
        const id = await repo.nextId('venda', 'id_venda');
        await repo.insertSale(id, session.id_sessao);
        return view(repo, (await repo.sale(id))!, session);
      });
    },
    addItem(saleId: number, operator: number, input: { codigo_barras?: string; id_produto?: number; quantidade: string }) {
      return write(async repo => {
        const { session, sale } = await lockOwnSale(repo, saleId, operator);
        const row = input.codigo_barras !== undefined ? await repo.productByBarcode(input.codigo_barras) : await repo.productById(input.id_produto!);
        if (!row) throw fail(404, 'PRODUCT_NOT_FOUND', 'Produto não encontrado.');
        if (row.ativo !== 1) throw fail(409, 'INACTIVE_PRODUCT', 'Produto inativo.');
        const amount = validateQuantity(row.unidade_medida, input.quantidade);
        const lines = (await repo.items(sale.id_venda, true)).filter(line => line.id_cancelamento === null && line.id_produto === row.id_produto);
        const inCart = lines.reduce((sum, line) => sum + milli(line.quantidade), 0n);
        checkStock(row, inCart + amount);
        // Mesmo produto e mesmo preço vigente: soma na linha ativa existente. Preço diferente: nova linha.
        const same = lines.find(line => line.preco_unitario === row.preco_venda);
        const price = cents(row.preco_venda);
        if (same) {
          const quantity = milli(same.quantidade) + amount;
          if (quantity > MAX_QUANTITY) throw fail(400, 'INVALID_QUANTITY', 'Quantidade acima do limite.');
          await repo.updateItem(same.id_item_venda, quantityText(quantity), moneyText(subtotal(quantity, price)));
        } else {
          const value = subtotal(amount, price);
          if (value > MAX_MONEY) throw fail(409, 'TOTAL_LIMIT', 'O subtotal excede o limite permitido.');
          const id = await repo.nextId('item_venda', 'id_item_venda');
          await repo.insertItem(id, sale.id_venda, row.id_produto, quantityText(amount), moneyText(price), moneyText(value));
        }
        return view(repo, await persistTotal(repo, sale), session);
      });
    },
    updateItem(saleId: number, itemId: number, operator: number, quantidade: string) {
      return write(async repo => {
        const { session, sale } = await lockOwnSale(repo, saleId, operator);
        const rows = await repo.items(sale.id_venda, true);
        const line = rows.find(row => row.id_item_venda === itemId);
        if (!line) throw fail(404, 'NOT_FOUND', 'Item não encontrado nesta venda.');
        if (line.id_cancelamento !== null) throw fail(409, 'ITEM_CANCELLED', 'O item já foi cancelado.');
        const row = (await repo.productById(line.id_produto))!;
        const amount = validateQuantity(row.unidade_medida, quantidade);
        const others = rows.filter(other => other.id_cancelamento === null && other.id_produto === line.id_produto && other.id_item_venda !== itemId)
          .reduce((sum, other) => sum + milli(other.quantidade), 0n);
        if (amount > milli(line.quantidade)) checkStock(row, others + amount);
        else if (row.ativo !== 1) throw fail(409, 'INACTIVE_PRODUCT', 'Produto inativo.');
        // O preço registrado no item é preservado (snapshot do momento da inclusão).
        const value = subtotal(amount, cents(line.preco_unitario));
        if (value > MAX_MONEY) throw fail(409, 'TOTAL_LIMIT', 'O subtotal excede o limite permitido.');
        await repo.updateItem(itemId, quantityText(amount), moneyText(value));
        return view(repo, await persistTotal(repo, sale), session);
      });
    },
    async cancelItem(saleId: number, itemId: number, operator: number, input: { motivo: string; supervisor: { matricula: string; senha: string } }) {
      // A senha é conferida fora da transação para não segurar bloqueios durante o bcrypt.
      const supervisor = await verify(input.supervisor.matricula, input.supervisor.senha);
      if (!supervisor) throw fail(403, 'INVALID_SUPERVISOR', 'Credenciais do supervisor inválidas.');
      if (!supervisor.permissoes.pode_cancelar_item) throw fail(403, 'SUPERVISOR_NOT_ALLOWED', 'O funcionário informado não pode autorizar cancelamentos.');
      if (supervisor.id === operator) throw fail(403, 'SAME_PERSON', 'O cancelamento precisa ser autorizado por outra pessoa.');
      return write(async repo => {
        const { session, sale } = await lockOwnSale(repo, saleId, operator);
        const current = await repo.supervisor(supervisor.id);
        if (!current || current.pode_cancelar_item !== 1) throw fail(403, 'SUPERVISOR_NOT_ALLOWED', 'O funcionário informado não pode autorizar cancelamentos.');
        const rows = await repo.items(sale.id_venda, true);
        const line = rows.find(row => row.id_item_venda === itemId);
        if (!line) throw fail(404, 'NOT_FOUND', 'Item não encontrado nesta venda.');
        if (line.id_cancelamento !== null) throw fail(409, 'ITEM_CANCELLED', 'O item já foi cancelado.');
        const id = await repo.nextId('cancelamento_item', 'id_cancelamento');
        await repo.insertCancellation(id, itemId, supervisor.id, input.motivo);
        return view(repo, await persistTotal(repo, sale), session);
      });
    },
    cancelSale(saleId: number, operator: number) {
      return write(async repo => {
        const { session, sale } = await lockOwnSale(repo, saleId, operator);
        await repo.items(sale.id_venda, true);
        if (await repo.payments(sale.id_venda)) throw fail(409, 'SALE_HAS_PAYMENTS', 'A venda possui pagamentos registrados.');
        if (await repo.movements(sale.id_venda)) throw fail(409, 'SALE_HAS_MOVEMENTS', 'A venda possui movimentações de estoque.');
        await repo.cancelSale(sale.id_venda);
        return view(repo, (await repo.sale(sale.id_venda))!, session);
      });
    },
  };
}

export type SalesService = ReturnType<typeof salesService>;
