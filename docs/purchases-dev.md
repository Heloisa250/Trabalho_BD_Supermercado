# Pedidos de compra

No perfil oficial, o fluxo é fornecedor → pedido `PENDENTE` → itens → cálculo de custos → envio → recebimento no Script 06. O alocador do R03 gera `id_pedido` sob lock até o commit ou rollback. O MySQL fornece a data da criação e o servidor obtém o responsável da sessão. O perfil legado mantém o status `ABERTO`.

A página **Pedidos de Compra** fica no menu administrativo. O responsável é obtido da sessão. Escolha um fornecedor ativo, pesquise seus produtos, confira o custo sugerido e monte os itens. Salve o pedido aberto. A API grava o cabeçalho e os itens iniciais na mesma transação. É possível salvar sem itens e completar depois.

Enquanto pendente, o pedido permite editar previsão e observação, incluir itens e editar quantidade e custo. A troca de fornecedor exige um pedido vazio. Para enviar, inclua ao menos um item. Pedidos pendentes ou enviados sem data de recebimento e sem lote associado podem ser cancelados. A remoção individual de itens está indisponível nesta versão.

O total estimado é calculado somando os subtotais já arredondados para dois decimais. O MySQL usa DECIMAL, e a prévia React usa inteiros escalados. Os preços negociados ficam gravados no item do pedido. As rotas de escrita bloqueiam o cabeçalho antes de verificar o estado, inclusive ao enviar e cancelar. O recebimento fica para o próximo script.

## Privilégios após autorização

O provisionador inclui as concessões para novas contas. Na instância oficial existente em 3307, aplique somente após autorização específica.

```sql
GRANT INSERT, UPDATE ON Supermercado.pedido_compra TO 'supermercado_r03_app'@'%';
GRANT INSERT, UPDATE ON Supermercado.item_pedido_compra TO 'supermercado_r03_app'@'%';
SHOW GRANTS FOR 'supermercado_r03_app'@'%';
```

Para validação real, use o produto e um fornecedor vinculados do Script 04. Crie um pedido demonstrativo, edite um item, confira os valores, envie e verifique que novas edições são rejeitadas. Reabra os detalhes após recarregar a página. Use outro pedido para o teste de cancelamento.

## API administrativa

Todas as rotas sob `/api/v1/pedidos-compra` exigem sessão administrativa. As escritas também exigem origem confiável.

| Método e caminho relativo | Uso |
| --- | --- |
| GET `/` | Lista paginada com filtros por número, fornecedor, responsável, status e período, com ordenação. |
| GET e PATCH `/:id` | Consultam o cabeçalho ou editam os campos permitidos. |
| POST `/` | Cria o pedido e os itens iniciais opcionais na mesma transação. |
| POST `/:id/enviar` e `/:id/cancelar` | Aplicam as transições permitidas. |
| GET `/fornecedor/:id/produtos` | Lista produtos ativos vinculados e custos sugeridos. |
| GET e POST `/:id/itens` | Consultam ou acrescentam itens. |
| PATCH `/:id/itens/:idProduto` | Edita a quantidade e o custo negociado pela chave composta. |
