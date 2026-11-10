import type { z } from 'zod';
import { AdminError } from '../admin/repository.js';
import type { PurchasesRepository } from './repository.js';
import type { createOrder, editItem, editOrder, item } from './schemas.js';

export function purchasesService(repo: PurchasesRepository, official: boolean) {
  const editable = official ? 'PENDENTE' : 'ABERTO';
  function requireOpen(status: string) {
    if (status !== editable) throw new AdminError(409, 'ORDER_NOT_OPEN', official
      ? 'O pedido precisa estar pendente.' : 'O pedido precisa estar aberto.');
  }

  return {
    list: repo.list,
    order: repo.order,
    offers: repo.offers,
    async items(id: number) {
      await repo.order(id);
      return repo.items(id);
    },
    create(data: z.infer<typeof createOrder>, employee: number) {
      return repo.transaction(async (conn) => {
        await repo.activeSupplier(conn, data.id_fornecedor);
        const id = await repo.create(conn, data.id_fornecedor, employee, data.data_prevista, data.observacao);
        for (const line of data.itens ?? []) {
          await repo.eligibleProduct(conn, data.id_fornecedor, line.id_produto);
          await repo.add(conn, id, line.id_produto, line.quantidade, line.custo_unitario);
        }
        return repo.order(id, conn);
      }, true);
    },
    update(id: number, data: z.infer<typeof editOrder>) {
      return repo.transaction(async (conn) => {
        const current = await repo.order(id, conn, true);
        requireOpen(current.status);
        if (data.id_fornecedor !== undefined && data.id_fornecedor !== current.id_fornecedor) {
          if (await repo.hasItems(conn, id)) throw new AdminError(409, 'ORDER_HAS_ITEMS', 'O fornecedor não pode mudar após incluir itens.');
          await repo.activeSupplier(conn, data.id_fornecedor);
        }
        await repo.update(conn, id, data);
        return repo.order(id, conn);
      });
    },
    add(id: number, data: z.infer<typeof item>) {
      return repo.transaction(async (conn) => {
        const current = await repo.order(id, conn, true);
        requireOpen(current.status);
        await repo.activeSupplier(conn, current.id_fornecedor);
        await repo.eligibleProduct(conn, current.id_fornecedor, data.id_produto);
        await repo.add(conn, id, data.id_produto, data.quantidade, data.custo_unitario);
        return repo.items(id, conn);
      });
    },
    edit(id: number, product: number, data: z.infer<typeof editItem>) {
      return repo.transaction(async (conn) => {
        requireOpen((await repo.order(id, conn, true)).status);
        await repo.edit(conn, id, product, data);
        return repo.items(id, conn);
      });
    },
    transition(id: number, next: 'ENVIADO' | 'CANCELADO') {
      return repo.transaction(async (conn) => {
        const { status, data_recebimento } = await repo.order(id, conn, true);
        if (next === 'ENVIADO') {
          requireOpen(status);
          if (!await repo.hasItems(conn, id)) throw new AdminError(409, 'ORDER_EMPTY', 'Inclua pelo menos um item antes de enviar.');
        } else if ((status !== editable && status !== 'ENVIADO') ||
          (official && (data_recebimento !== null || await repo.hasReceipt(conn, id)))) {
          throw new AdminError(409, 'INVALID_TRANSITION', 'Este pedido não pode ser cancelado.');
        }
        await repo.update(conn, id, { status: next });
        return repo.order(id, conn);
      });
    },
  };
}
