# Roadmap do schema oficial

Cada etapa exige instrução própria e aceite independente. Os resultados do legado servem como referência de regressão.

| Etapa | Escopo | Aceite |
| --- | --- | --- |
| R00 | Auditoria, diferenças, backup e instância paralela | Commit e hashes registrados, catálogo oficial validado e legado preservado. |
| R01 | Configuração paralela do Express e conta dedicada | Schema exato, grants autorizados, health e ready reais nos dois ambientes. |
| R02 | Login, bcrypt e lista administrativa | Provisionamento autorizado de contas de teste, login/logout e separação de supervisor e administrador. |
| R03 | Funcionários, cargos, caixas, pagamentos e senha | IDs e valores obrigatórios explícitos, unicidade concorrente e CRUD real após autorização da conta de escrita. |
| R04 | Categorias, marcas, produtos, fornecedores e vínculos | Validação dos três ENUMs de unidade, IDs, ciclos, custos e interface com banco real. |
| 05 | Pedidos e itens | Adaptar código existente para PENDENTE, IDs e datas explícitas, transições e valores validados no React e MySQL. |
| 06 | Recebimento, lotes, validade e estoque | Recebimento transacional, código único por produto, saldo consistente, entradas e perdas rastreáveis. |
| 07 | Sessões de caixa | Abertura e fechamento com IDs explícitos, operador, troco e prevenção de concorrência indevida. |
| 08 | PDV e itens de venda | Cadastro de venda, subtotal persistido, cancelamento por supervisor e vínculo ao estoque. |
| 09 | Pagamentos e finalização | Pagamentos múltiplos, troco explícito, baixa transacional e comprovante demonstrativo. |
| 10 | Dashboard e relatórios | Faturamento, vendas, compras, estoque, validade e movimentos reconciliados com dados reais. |
| 11 | Refinamento de interface | Navegação, responsividade, formulários, tabelas e estados de erro validados. |
| 12 | Testes finais e apresentação | Regressão, concorrência, segurança, integridade e roteiro acadêmico aprovados. |
