# Regras de negócio no modelo oficial

- Autenticação por matrícula, funcionário ativo, bcrypt e sessão JWT. A autorização administrativa depende de lista explícita por ambiente. A flag do cargo permite aprovar cancelamento de item e é avaliada separadamente.
- Pedidos nascem PENDENTE e podem ser enviados ou cancelados. Enviados podem ser cancelados conforme o fluxo de compras. Recebimento será tratado no Script 06. Itens preservam quantidade e custo negociado por produto e pedido.
- O estoque é controlado por lote. O saldo e o movimento devem ser atualizados juntos. O código do lote é único por produto. Correções de saída precisam de uma convenção documentada de AJUSTE, com sinal, motivo e vínculo ao item quando disponível.
- Subtotal é quantidade vezes preço, arredondado por linha. Persistir subtotal e troco em DECIMAL e calcular o total da venda com itens elegíveis. Troco depende da forma de pagamento e do valor recebido. Usar aritmética decimal exata e persistir alterações financeiras na mesma transação.
- Preservar as unicidades funcionais necessárias em operações concorrentes onde o SQL não as impõe. Confirmar as regras de uma nota por venda e um cancelamento por item antes dos módulos correspondentes. O comprovante acadêmico não equivale à autorização fiscal.
- Tratar exemplos do DML como dados de laboratório. Novos cadastros passam pelas validações da aplicação. A adoção do DML não substitui a validação de CPF, CNPJ, saldo, pagamento e consistência operacional.


## Administração oficial

Funcionários ativos podem abrir um caixa disponível. Cada terminal e operador pode ter apenas uma sessão aberta. O operador responsável fecha sua própria sessão após resolver vendas abertas e pagamentos pendentes. A conferência compara o valor contado com o fundo mais o dinheiro aplicado nas vendas finalizadas. Consulte [Sessões de caixa](cash-sessions.md).

No [PDV](pdv-vendas.md), a venda pertence à sessão aberta do operador autenticado, com no máximo uma venda ABERTA por sessão. O preço do item é o vigente na inclusão e não muda depois. Subtotal e total são calculados no servidor em aritmética decimal exata. O item cancelado permanece para auditoria, é identificado pela existência de `cancelamento_item` e não entra no total. O cancelamento exige um supervisor diferente do operador, autenticado por senha, com `pode_cancelar_item`. A disponibilidade de estoque é verificada sem reserva; a baixa ocorre só na finalização (Script 09).

Na [finalização](pagamentos-finalizacao.md), a soma dos pagamentos deve ser exatamente o total dos itens ativos. Troco só existe em dinheiro físico, e `valor_recebido − troco = valor`. Pagamentos, baixa de estoque por lote (FEFO, lotes sem validade por último, vencidos nunca) e mudança para FINALIZADA acontecem numa única transação. O comprovante é demonstrativo e sem valor fiscal; nenhuma nota fiscal é emitida.

O [estoque oficial](stock-official.md) recebe pedidos integralmente, registra entradas por lote e conserva o custo negociado. Perdas e ajustes exigem motivo e movimentação auditável. A validade afeta a disponibilidade estimada e não reduz automaticamente o saldo físico.

Pedidos de compra começam em `PENDENTE` e mantêm o funcionário da sessão como responsável. Somente pedidos pendentes permitem edição. O envio exige pelo menos um item. O cancelamento exige pedido pendente ou enviado sem recebimento associado. O custo negociado fica no item, e o total soma os subtotais arredondados. Consulte o [fluxo de compras](purchases-dev.md).

No [catálogo oficial](catalog-dev.md), categoria e marca aceitam nomes repetidos. Produto e fornecedor usam IDs explícitos e têm unicidade por código de barras e CNPJ, respectivamente. O vínculo comercial é único por par produto–fornecedor.

No cadastro, funcionário, caixa e forma de pagamento exigem a situação inicial. A permissão de cancelamento pertence ao cargo e é independente da administração. F0001 fica protegido contra desativação e mudanças pela rota de administração. A edição parcial de funcionários importados não revalida um CPF ausente do corpo. Um novo CPF passa pela validação atual. Desativar caixa exige ausência de sessão aberta.
