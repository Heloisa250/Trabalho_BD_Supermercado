# Script 08 — Frente de Caixa (PDV) e registro de vendas

Fluxo: **sessão aberta → nova venda → código de barras → itens → cálculo → venda ABERTA aguardando pagamento.**
A finalização financeira (pagamentos, troco, status FINALIZADA) e a baixa de estoque por lote (`SAIDA_VENDA`) estão em [pagamentos-finalizacao.md](pagamentos-finalizacao.md) (Script 09).
Identificador de demonstração: `QA-S08` (somente documentação e testes; não existe coluna para armazená-lo).

## Estrutura usada (DDL oficial intacto)

| Tabela | Uso no PDV |
| --- | --- |
| `venda` | INSERT (ABERTA, total 0.00, `data_hora` do servidor) e UPDATE de `valor_total`/`status`. |
| `item_venda` | INSERT e UPDATE de `quantidade`/`subtotal`. `preco_unitario` é snapshot e nunca é alterado. |
| `cancelamento_item` | INSERT de auditoria. A situação do item (ATIVO/CANCELADO) é derivada da existência desse registro. |
| `sessao_caixa`, `caixa`, `funcionario`, `cargo`, `produto`, `lote`, `pagamento`, `movimentacao_estoque` | Somente leitura. |

## Regras

- **Operador e sessão**: vêm do JWT. O cliente nunca informa `id_sessao`, preço, subtotal, total ou `id_supervisor` (schemas Zod estritos rejeitam campos extras com 400).
- **Abertura**: exige funcionário ativo, sessão aberta do próprio operador e terminal ativo. Política: **uma venda ABERTA por sessão**. A venda ABERTA histórica nº 5 (sessão 3) não é tocada.
- **Quantidade**: > 0, até 3 casas, até 9.999.999,999; `UN` exige inteiro; `KG` e `L` aceitam fração.
- **Estoque vendável**: soma de lotes com saldo > 0 e validade nula ou ≥ hoje, só para produto ativo. Lotes vencidos aparecem como "vencido" e não contam. A verificação considera a quantidade já no carrinho da mesma venda. **É uma pré-validação, sem reserva**: o estoque pode mudar entre a inclusão e o pagamento; o Script 09 revalida na transação de finalização. Vendas abertas de outros terminais não são descontadas.
- **Valores**: `subtotal = quantidade × preco_unitario`, arredondado meio-para-cima em centavos, calculado com BigInt (sem `Number`). `valor_total` = soma dos subtotais dos itens sem cancelamento, gravado na mesma transação de cada inclusão, edição ou cancelamento. Sem descontos.
- **Produto repetido**: se já há item ativo do produto com o mesmo preço vigente, a quantidade é somada nessa linha. Se o preço do cadastro mudou, cria-se nova linha (linhas com preços diferentes não são mescladas). Itens cancelados nunca são reativados.
- **Edição**: só em venda ABERTA, item não cancelado; preço histórico preservado; aumento de quantidade revalida estoque.
- **Cancelamento de item**: o operador escolhe o motivo e um supervisor digita matrícula e senha. O servidor confere bcrypt (`authService.verify`, sem emitir token), `cargo.pode_cancelar_item`, funcionário ativo e **pessoa diferente do operador**. A permissão é independente de `ADMIN_MATRICULAS`. Limite de 10 tentativas falhas por 15 min. O item permanece em `item_venda`; o subtotal histórico é mantido, mas sai do total.
- **Cancelamento da venda**: só ABERTA, do próprio operador, sem pagamentos e sem movimentações ligadas aos itens. Muda `status` para CANCELADA e mantém os itens. Não há coluna para o motivo do cancelamento da venda; a confirmação da interface (`{"confirmar": true}`) não é persistida. Venda FINALIZADA não pode ser cancelada aqui.

## Concorrência e IDs

Todas as escritas do PDV rodam em transação sob o lock nomeado `sqlider:Supermercado:venda` (`GET_LOCK`), que protege os alocadores explícitos (`nextExplicitId`) de `venda`, `item_venda` e `cancelamento_item`; liberação garantida em `finally`, rollback em falha, limite de INT verificado.
Ordem de bloqueio padronizada: lock nomeado → `sessao_caixa` (FOR UPDATE) → `venda` (FOR UPDATE) → `item_venda` (o bloqueio dos itens também serializa os INSERTs em `cancelamento_item`, que não é bloqueado porque a conta só tem INSERT nele).
O fechamento de caixa (Script 07) também bloqueia a sessão e recusa fechar com venda ABERTA; por isso uma inclusão concorrente com o fechamento é serializada e, depois do fechamento, toda gravação retorna `409 SESSION_CLOSED`.
**Limitação**: a unicidade de "uma venda ABERTA por sessão" e de "um cancelamento por item" é garantida pelo protocolo da aplicação, não pelo DDL. Escritores externos que não usem o lock e os bloqueios podem violá-la.

## API (`/api/v1/vendas`, sessão obrigatória; escritas exigem origem confiável)

| Método e caminho | Uso |
| --- | --- |
| GET `/` | Vendas do operador (`status`, `pagina`). |
| GET `/ativa` | Sessão aberta do operador e venda ABERTA (ou `null`). |
| GET `/produtos?codigo_barras=` / `?busca=` | Consulta de preço, unidade e disponibilidade (o catálogo administrativo é restrito a administradores). |
| GET `/:id` | Venda com itens e situação de cada item. |
| POST `/` | Abre venda (corpo vazio). |
| POST `/:id/cancelar` | `{ "confirmar": true }`. |
| GET `/:id/itens` | Itens. |
| POST `/:id/itens` | `{ codigo_barras, quantidade }` ou `{ id_produto, quantidade }`. |
| PATCH `/:id/itens/:idItem` | `{ quantidade }`. |
| POST `/:id/itens/:idItem/cancelar` | `{ motivo, supervisor: { matricula, senha } }`. |

Quantidades são strings decimais (`"1.250"`). Não há DELETE nem endpoints de pagamento.

## Interface

Rota React `/pdv` ("Frente de Caixa — PDV"): foco automático no campo de código de barras, leitura por leitor USB (teclado + Enter) com leituras consecutivas, busca por nome, cartão do produto (preço, unidade, disponível/vencido), carrinho com edição e pedido de cancelamento, total, confirmação para cancelar venda e botão de pagamento desabilitado ("Script 09"). O estado vem da API, por isso persiste após F5; um 401 devolve ao login.

## Privilégios MySQL

Necessários para a conta `supermercado_r03_app` (já incluídos no provisionador para instalações novas):

```sql
GRANT INSERT, UPDATE ON Supermercado.venda TO 'supermercado_r03_app'@'%';
GRANT INSERT, UPDATE ON Supermercado.item_venda TO 'supermercado_r03_app'@'%';
GRANT INSERT ON Supermercado.cancelamento_item TO 'supermercado_r03_app'@'%';
```

Sem DELETE, sem escrita em `pagamento`, `nota_fiscal`, `lote` (além do já existente) ou `movimentacao_estoque` para este script.

## Supervisor para demonstração

Entre os funcionários ativos com `pode_cancelar_item = 1`, apenas F0001 possui hash bcrypt; F0002 mantém o hash SHA-256 importado e não consegue autorizar. Como F0001 é o operador da sessão 5, o teste real de cancelamento exige provisionar com segurança uma senha bcrypt para outra conta supervisora (por exemplo F0002), o que depende de autorização explícita.
