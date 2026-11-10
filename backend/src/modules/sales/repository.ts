import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { nextExplicitId } from '../../config/mysql-transaction.js';
import { CASH_FORM_SQL } from '../cash/conference.js';
import type { LotRow, PaymentForm } from './checkout.js';

type Conn = Pool | PoolConnection;
type Arg = string | number | null;

export type SessionRow = { id_sessao: number; id_caixa: number; id_operador: number; numero: number; caixa_ativo: number;
  data_abertura: string; data_fechamento: string | null; fundo_troco: string };
export type SaleRow = { id_venda: number; id_sessao: number; data_hora: string; valor_total: string; status: 'ABERTA' | 'FINALIZADA' | 'CANCELADA' };
export type ProductRow = { id_produto: number; codigo_barras: string; nome: string; unidade_medida: 'UN' | 'KG' | 'L';
  preco_venda: string; ativo: number; disponivel: string; fisico: string; vencido: string };
export type ItemRow = { id_item_venda: number; id_venda: number; id_produto: number; quantidade: string; preco_unitario: string;
  subtotal: string | null; nome: string; codigo_barras: string; unidade_medida: 'UN' | 'KG' | 'L';
  id_cancelamento: number | null; cancelado_em: string | null; motivo: string | null; supervisor: string | null };
export type PaymentRow = { id_pagamento: number; id_forma_pagamento: number; forma: string; valor: string; valor_recebido: string | null; troco: string | null; data_hora: string };
export type SupervisorRow = { id_funcionario: number; pode_cancelar_item: number };

async function rows<T>(conn: Conn, sql: string, args: Arg[] = []) {
  const [result] = await conn.execute<RowDataPacket[]>(sql, args);
  return result as unknown as T[];
}

const productSelect = `SELECT p.id_produto,p.codigo_barras,p.nome,p.unidade_medida,p.preco_venda,p.ativo,
  COALESCE(SUM(IF(l.quantidade_atual>0 AND (l.data_validade IS NULL OR l.data_validade>=CURRENT_DATE),l.quantidade_atual,0)),0) AS disponivel,
  COALESCE(SUM(l.quantidade_atual),0) AS fisico,
  COALESCE(SUM(IF(l.data_validade<CURRENT_DATE,l.quantidade_atual,0)),0) AS vencido
  FROM produto p LEFT JOIN lote l USING(id_produto)`;
const itemSelect = `SELECT i.id_item_venda,i.id_venda,i.id_produto,i.quantidade,i.preco_unitario,i.subtotal,
  p.nome,p.codigo_barras,p.unidade_medida,c.id_cancelamento,c.data_hora AS cancelado_em,c.motivo,f.matricula AS supervisor
  FROM item_venda i JOIN produto p USING(id_produto)
  LEFT JOIN cancelamento_item c ON c.id_cancelamento=(SELECT MIN(x.id_cancelamento) FROM cancelamento_item x WHERE x.id_item_venda=i.id_item_venda)
  LEFT JOIN funcionario f ON f.id_funcionario=c.id_supervisor`;
const sessionSelect = `SELECT s.id_sessao,s.id_caixa,s.id_operador,s.data_abertura,s.data_fechamento,s.fundo_troco,
  c.numero,c.ativo AS caixa_ativo FROM sessao_caixa s JOIN caixa c USING(id_caixa)`;

// Leituras e escritas do PDV. Cada método recebe a conexão da transação corrente;
// os bloqueios FOR UPDATE seguem a ordem: sessão → venda → itens → cancelamentos.
export function salesRepository(conn: Conn) {
  return {
    async employeeActive(id: number) {
      return (await rows(conn, `SELECT 1 FROM funcionario WHERE id_funcionario=? AND ativo=1
        AND (data_demissao IS NULL OR data_demissao>CURRENT_DATE) FOR SHARE`, [id])).length === 1;
    },
    async supervisor(id: number) {
      const [row] = await rows<SupervisorRow>(conn, `SELECT f.id_funcionario,c.pode_cancelar_item FROM funcionario f JOIN cargo c USING(id_cargo)
        WHERE f.id_funcionario=? AND f.ativo=1 AND (f.data_demissao IS NULL OR f.data_demissao>CURRENT_DATE) FOR SHARE`, [id]);
      return row;
    },
    async openSessionOf(operator: number) {
      const [row] = await rows<SessionRow>(conn, sessionSelect + ' WHERE s.id_operador=? AND s.data_fechamento IS NULL ORDER BY s.id_sessao LIMIT 1', [operator]);
      return row;
    },
    async session(id: number, lock = false) {
      const [row] = await rows<SessionRow>(conn, sessionSelect + ' WHERE s.id_sessao=?' + (lock ? ' FOR UPDATE OF s' : ''), [id]);
      return row;
    },
    async saleSessionId(sale: number) {
      const [row] = await rows<{ id_sessao: number }>(conn, 'SELECT id_sessao FROM venda WHERE id_venda=?', [sale]);
      return row?.id_sessao;
    },
    async sale(id: number, lock = false) {
      const [row] = await rows<SaleRow>(conn, 'SELECT id_venda,id_sessao,data_hora,valor_total,status FROM venda WHERE id_venda=?' + (lock ? ' FOR UPDATE' : ''), [id]);
      return row;
    },
    async openSales(session: number, lock = false) {
      return rows<SaleRow>(conn, "SELECT id_venda,id_sessao,data_hora,valor_total,status FROM venda WHERE id_sessao=? AND status='ABERTA' ORDER BY id_venda" + (lock ? ' FOR UPDATE' : ''), [session]);
    },
    async salesOf(operator: number, status: string | null, offset: number, limit: number) {
      return rows<SaleRow & { numero: number }>(conn, `SELECT v.id_venda,v.id_sessao,v.data_hora,v.valor_total,v.status,c.numero
        FROM venda v JOIN sessao_caixa s USING(id_sessao) JOIN caixa c USING(id_caixa)
        WHERE s.id_operador=? AND (? IS NULL OR v.status=?) ORDER BY v.id_venda DESC LIMIT ? OFFSET ?`,
      [operator, status, status, limit, offset]);
    },
    nextId: (table: 'venda' | 'item_venda' | 'cancelamento_item' | 'pagamento' | 'movimentacao_estoque', key: string) => nextExplicitId(conn as PoolConnection, table, key),
    async insertSale(id: number, session: number) {
      await conn.execute("INSERT INTO venda (id_venda,id_sessao,data_hora,valor_total,status) VALUES (?,?,CURRENT_TIMESTAMP,'0.00','ABERTA')", [id, session]);
    },
    async productById(id: number) {
      const [row] = await rows<ProductRow>(conn, productSelect + ' WHERE p.id_produto=? GROUP BY p.id_produto', [id]);
      return row;
    },
    async productByBarcode(code: string) {
      const [row] = await rows<ProductRow>(conn, productSelect + ' WHERE BINARY p.codigo_barras=? GROUP BY p.id_produto', [code]);
      return row;
    },
    async searchProducts(term: string) {
      return rows<ProductRow>(conn, productSelect + ` WHERE p.ativo=1 AND (LOCATE(?,p.nome)>0 OR LOCATE(?,p.codigo_barras)=1)
        GROUP BY p.id_produto ORDER BY p.nome,p.id_produto LIMIT 20`, [term, term]);
    },
    async items(sale: number, lock = false) {
      // O bloqueio das linhas de item_venda serializa os cancelamentos (todo INSERT em cancelamento_item
      // passa por aqui antes). cancelamento_item não é bloqueado: a conta só tem INSERT nessa tabela.
      if (lock) await conn.execute('SELECT id_item_venda FROM item_venda WHERE id_venda=? FOR UPDATE', [sale]);
      return rows<ItemRow>(conn, itemSelect + ' WHERE i.id_venda=? ORDER BY i.id_item_venda', [sale]);
    },
    async insertItem(id: number, sale: number, product: number, quantity: string, price: string, subtotal: string) {
      await conn.execute(`INSERT INTO item_venda (id_item_venda,id_venda,id_produto,quantidade,preco_unitario,subtotal)
        VALUES (?,?,?,?,?,?)`, [id, sale, product, quantity, price, subtotal]);
    },
    async updateItem(id: number, quantity: string, subtotal: string) {
      await conn.execute('UPDATE item_venda SET quantidade=?,subtotal=? WHERE id_item_venda=?', [quantity, subtotal, id]);
    },
    async insertCancellation(id: number, item: number, supervisor: number, reason: string) {
      await conn.execute(`INSERT INTO cancelamento_item (id_cancelamento,id_item_venda,id_supervisor,data_hora,motivo)
        VALUES (?,?,?,CURRENT_TIMESTAMP,?)`, [id, item, supervisor, reason]);
    },
    async updateTotal(sale: number, total: string) {
      await conn.execute('UPDATE venda SET valor_total=? WHERE id_venda=?', [total, sale]);
    },
    async cancelSale(sale: number) {
      await conn.execute("UPDATE venda SET status='CANCELADA' WHERE id_venda=? AND status='ABERTA'", [sale]);
    },
    async payments(sale: number) {
      return (await rows<{ n: number }>(conn, 'SELECT COUNT(*) AS n FROM pagamento WHERE id_venda=?', [sale]))[0].n;
    },
    async movements(sale: number) {
      return (await rows<{ n: number }>(conn, `SELECT COUNT(*) AS n FROM movimentacao_estoque m JOIN item_venda i USING(id_item_venda)
        WHERE i.id_venda=?`, [sale]))[0].n;
    },
    async paymentForms() {
      return rows<PaymentForm>(conn, `SELECT fp.id_forma_pagamento,fp.descricao,fp.permite_troco,fp.ativo,${CASH_FORM_SQL} AS dinheiro
        FROM forma_pagamento fp ORDER BY fp.id_forma_pagamento`);
    },
    async paymentsOf(sale: number) {
      return rows<PaymentRow>(conn, `SELECT p.id_pagamento,p.id_forma_pagamento,fp.descricao AS forma,p.valor,p.valor_recebido,p.troco,p.data_hora
        FROM pagamento p JOIN forma_pagamento fp USING(id_forma_pagamento) WHERE p.id_venda=? ORDER BY p.id_pagamento`, [sale]);
    },
    // Bloqueia todos os lotes dos produtos em ordem crescente de id_lote (ordem determinística).
    async lockLots(products: readonly number[]) {
      if (!products.length) return [];
      return rows<LotRow>(conn, `SELECT id_lote,id_produto,data_validade,data_entrada,quantidade_atual,
        (data_validade IS NOT NULL AND data_validade<CURRENT_DATE) AS vencido
        FROM lote WHERE id_produto IN (${products.map(() => '?').join(',')}) ORDER BY id_lote FOR UPDATE`, [...products]);
    },
    async productsActive(products: readonly number[]) {
      if (!products.length) return [];
      return rows<{ id_produto: number; nome: string; ativo: number }>(conn,
        `SELECT id_produto,nome,ativo FROM produto WHERE id_produto IN (${products.map(() => '?').join(',')})`, [...products]);
    },
    async insertPayment(id: number, sale: number, form: number, valor: string, recebido: string, troco: string) {
      await conn.execute(`INSERT INTO pagamento (id_pagamento,id_venda,id_forma_pagamento,valor,valor_recebido,troco,data_hora)
        VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)`, [id, sale, form, valor, recebido, troco]);
    },
    // O lote já está bloqueado FOR UPDATE nesta transação; o saldo final foi calculado em milésimos exatos.
    async setLotBalance(lot: number, balance: string) {
      const [result] = await conn.execute('UPDATE lote SET quantidade_atual=? WHERE id_lote=?', [balance, lot]);
      return (result as { affectedRows: number }).affectedRows;
    },
    async insertSaleMovement(id: number, lot: number, item: number, employee: number, quantity: string, note: string) {
      await conn.execute(`INSERT INTO movimentacao_estoque (id_movimentacao,id_lote,id_item_venda,id_funcionario,tipo,quantidade,data_hora,observacao)
        VALUES (?,?,?,?,'SAIDA_VENDA',?,CURRENT_TIMESTAMP,?)`, [id, lot, item, employee, quantity, note]);
    },
    async finalizeSale(sale: number) {
      const [result] = await conn.execute("UPDATE venda SET status='FINALIZADA' WHERE id_venda=? AND status='ABERTA'", [sale]);
      return (result as { affectedRows: number }).affectedRows;
    },
    async saleMovements(sale: number) {
      return rows<{ id_movimentacao: number; id_item_venda: number; id_lote: number; codigo_lote: string; quantidade: string }>(conn,
        `SELECT m.id_movimentacao,m.id_item_venda,m.id_lote,l.codigo_lote,m.quantidade FROM movimentacao_estoque m
        JOIN item_venda i USING(id_item_venda) JOIN lote l ON l.id_lote=m.id_lote WHERE i.id_venda=? ORDER BY m.id_movimentacao`, [sale]);
    },
    async operatorOf(id: number) {
      const [row] = await rows<{ nome: string; matricula: string }>(conn, 'SELECT nome,matricula FROM funcionario WHERE id_funcionario=?', [id]);
      return row;
    },
  };
}

export type SalesRepository = ReturnType<typeof salesRepository>;
