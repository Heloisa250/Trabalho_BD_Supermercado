# Regras de negócio no modelo oficial

- Autenticação por matrícula, funcionário ativo, bcrypt e sessão JWT. A autorização administrativa depende de lista explícita por ambiente. A flag do cargo permite aprovar cancelamento de item e é avaliada separadamente.
- Pedidos nascem PENDENTE e podem ser enviados ou cancelados. Enviados podem ser cancelados conforme o fluxo de compras. Recebimento será tratado no Script 06. Itens preservam quantidade e custo negociado por produto e pedido.
- O estoque é controlado por lote. O saldo e o movimento devem ser atualizados juntos. O código do lote é único por produto. Correções de saída precisam de uma convenção documentada de AJUSTE, com sinal, motivo e vínculo ao item quando disponível.
- Subtotal é quantidade vezes preço, arredondado por linha. Persistir subtotal e troco em DECIMAL e calcular o total da venda com itens elegíveis. Troco depende da forma de pagamento e do valor recebido. Usar aritmética decimal exata e persistir alterações financeiras na mesma transação.
- Preservar as unicidades funcionais necessárias em operações concorrentes onde o SQL não as impõe. Confirmar as regras de uma nota por venda e um cancelamento por item antes dos módulos correspondentes. O comprovante acadêmico não equivale à autorização fiscal.
- Tratar exemplos do DML como dados de laboratório. Novos cadastros passam pelas validações da aplicação. A adoção do DML não substitui a validação de CPF, CNPJ, saldo, pagamento e consistência operacional.
