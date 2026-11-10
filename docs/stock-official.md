# Estoque e lotes oficiais

O Script 06 usa o schema `Supermercado`. O fluxo é pedido enviado → recebimento integral → lotes → movimentações de entrada → estoque atualizado. Um item pode ser dividido entre lotes. O servidor compara as somas em milésimos, copia o custo negociado do item e só registra o recebimento quando todos os produtos e quantidades conferem. O pedido, os lotes e as movimentações são gravados na mesma transação.

O cabeçalho do pedido e os itens são bloqueados durante o recebimento. Status, data e lotes existentes impedem repetição. O código do lote é único por produto. As operações administrativas de estoque usam o mesmo lock nomeado e o alocador de IDs explícitos do R03 para lote e movimentação. O lock fica na conexão que executa a transação até commit ou rollback. Escritores futuros que alocarem IDs nessas tabelas devem usar o mesmo lock.

Uma entrada independente cria lote sem pedido e registra ENTRADA. Uma perda exige motivo e quantidade positiva, reduz o saldo e grava PERDA com quantidade positiva. Um ajuste exige o saldo físico contado e motivo, registra o delta assinado em AJUSTE e preserva a quantidade inicial. Contagem igual ao saldo registrado não gera movimentação. SAIDA_VENDA permanece disponível para consulta de histórico e representa baixa positiva.

O saldo físico soma todos os lotes, inclusive vencidos. O saldo potencialmente disponível inclui lotes sem validade e lotes com validade a partir de hoje, somente para produto ativo. A faixa mínimo/máximo usa o saldo físico. Produtos sem lotes aparecem com zero. O horizonte de vencimento é inclusivo, usa a data do MySQL e começa em 30 dias. A data de fabricação, quando informada, deve anteceder ou coincidir com a validade e com a data de entrada. As consultas de alerta não alteram saldos.

O recebimento parcial fica fora deste fluxo porque o pedido é concluído integralmente e o ENUM oficial não prevê um estado intermediário.

| Método e rota sob `/api/v1` | Uso |
| --- | --- |
| GET `/estoque` | Saldo por produto, busca, faixa, horizonte e paginação. |
| GET `/lotes`, `/lotes/:id`, `/produtos/:id/lotes` | Lotes, detalhes e filtros por produto e validade. |
| GET `/estoque/movimentacoes` | Histórico paginado com filtros por produto e tipo. |
| POST `/pedidos-compra/:id/receber` | Recebe todos os itens com `{ lotes: [...] }`. Cada lote informa produto, código, quantidade e datas opcionais. |
| POST `/estoque/entradas` | Cria entrada independente com os campos do lote e `custo_unitario`. |
| POST `/lotes/:id/perdas` | Registra `quantidade` e `motivo`. |
| POST `/lotes/:id/ajustes` | Registra `saldo` contado e `motivo`. |

As rotas são oficiais, administrativas e usam CSRF nas escritas. Quantidades e custos são strings decimais com até três e duas casas, respectivamente.

O provisionador inclui as permissões para instalações novas. A aplicação existente em 3307 requer autorização específica para as duas concessões abaixo. O UPDATE em pedido_compra já foi concedido no Script 05.1.

```sql
GRANT INSERT, UPDATE ON Supermercado.lote TO 'supermercado_r03_app'@'%';
GRANT INSERT ON Supermercado.movimentacao_estoque TO 'supermercado_r03_app'@'%';
```
