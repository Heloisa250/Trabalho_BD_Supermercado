# Roadmap do schema oficial

Cada etapa exige instrução própria e aceite independente. Os resultados do legado servem como referência de regressão.

| Etapa | Escopo | Aceite |
| --- | --- | --- |
| R00 | Auditoria, diferenças, backup e instância paralela | Commit e hashes registrados, catálogo oficial validado e legado preservado. |
| R01 | Configuração paralela do Express e conta dedicada | Schema exato, grants autorizados, health e ready reais nos dois ambientes. |
| R02 | Login, bcrypt e lista administrativa | Provisionamento autorizado de contas de teste, login/logout e separação de supervisor e administrador. |
| R03 | Funcionários, cargos, caixas, pagamentos e senha | IDs e valores obrigatórios explícitos, unicidade concorrente e CRUD real após autorização da conta de escrita. |
| R04 | Categorias, marcas, produtos, fornecedores e vínculos | Concluído. Escrita e persistência verificadas no React e no MySQL oficial. Referências inexistentes rejeitadas pela API oficial. |
| 05 | Pedidos e itens | Concluído. Criação, edição, envio e cancelamento validados no React e no MySQL oficial. |
| 06 | Recebimento, lotes, validade e estoque | Concluído. Recebimento, datas, entrada independente, perda e ajustes validados. |
| 07 | Sessões de caixa | Concluído. Abertura, fechamento e conferência validados no MySQL oficial. A sessão 5 está aberta para o futuro teste do PDV. |
| 08 | PDV e itens de venda | Implementado ([PDV](pdv-vendas.md)): venda ABERTA por sessão, itens com preço snapshot, subtotal e total persistidos, cancelamento auditado por supervisor distinto, sem baixa de estoque. Testes automatizados aprovados; testes reais de escrita aguardam os GRANTs de `venda`, `item_venda` e `cancelamento_item`, e o cancelamento real aguarda uma segunda conta supervisora com bcrypt. |
| 09 | Pagamentos e finalização | Implementado ([pagamentos](pagamentos-finalizacao.md)): pagamentos múltiplos em centavos, troco só em dinheiro físico, finalização atômica com baixa FEFO e SAIDA_VENDA, comprovante demonstrativo. Validado em cópia isolada do banco. A finalização real da venda nº 6 aguarda o GRANT de INSERT em `pagamento` e autorização específica. |
| 10 | Dashboard e relatórios | Faturamento, vendas, compras, estoque, validade e movimentos reconciliados com dados reais. |
| 11 | Refinamento de interface | Navegação, responsividade, formulários, tabelas e estados de erro validados. |
| 12 | Testes finais e apresentação | Regressão, concorrência, segurança, integridade e roteiro acadêmico aprovados. |
