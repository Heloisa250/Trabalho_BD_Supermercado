> Documento do ambiente legado. Para o schema oficial, consulte [Banco oficial](banco-oficial.md).

# Pedidos de compra

A página **Pedidos de Compra** fica no menu administrativo. O responsável é obtido da sessão. Escolha um fornecedor ativo, pesquise seus produtos, confira o custo sugerido e monte os itens. Salve o pedido aberto. A API grava o cabeçalho e os itens iniciais na mesma transação. É possível salvar sem itens e completar depois.

Enquanto aberto, o pedido permite editar previsão e observação, incluir itens e editar quantidade e custo. A troca de fornecedor exige um pedido vazio. Para enviar, inclua ao menos um item. Pedidos abertos ou enviados podem ser cancelados. A remoção individual de itens está indisponível nesta versão.

O total estimado é calculado somando os subtotais já arredondados para dois decimais. O MySQL usa DECIMAL, e a prévia React usa inteiros escalados. Os preços negociados ficam gravados no item do pedido. As rotas de escrita bloqueiam o cabeçalho antes de verificar o estado, inclusive ao enviar e cancelar. O recebimento fica para o próximo script.

## Privilégios após autorização

Confirme o container isolado, o schema e a conta com `SHOW GRANTS FOR 'supermercado_app'@'%';`. Aplique somente após autorização específica:

```sql
GRANT INSERT, UPDATE ON supermercado.pedido_compra TO 'supermercado_app'@'%';
GRANT INSERT, UPDATE ON supermercado.item_pedido_compra TO 'supermercado_app'@'%';
SHOW GRANTS FOR 'supermercado_app'@'%';
```

Para validação real, use o produto e um fornecedor vinculados do Script 04. Crie um pedido demonstrativo, edite um item, confira os valores, envie e verifique que novas edições são rejeitadas. Reabra os detalhes após recarregar a página. Use outro pedido para o teste de cancelamento.
