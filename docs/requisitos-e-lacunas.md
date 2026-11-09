> Documento do ambiente legado. Para o schema oficial, consulte [Banco oficial](banco-oficial.md).

# Requisitos e lacunas

A classificação compara todos os objetivos funcionais e os detalhes da introdução de `supermercado qualidade líder.txt` com o SQL entregue. **Total** indica que o recorte descrito tem representação ou garantia direta no banco. **Parcial** indica que o banco fornece parte do suporte. **Ausente** indica que o mecanismo ou resultado exigido não existe no SQL. A classificação não pressupõe uma aplicação já implementada.

| Requisito do TXT | Suporte | Evidência e encaminhamento |
| --- | --- | --- |
| Identificação, variedade, marca e preço dos produtos | Total | `produto` tem ID, código de barras único, preço e unidade. `categoria` tem pai opcional e `marca` é opcional. Validar ciclos e apresentação da árvore na aplicação. |
| Armazenar lotes, quantidades e validade | Total | `lote` registra produto, código, datas, custo e quantidades inicial e atual. Validade e fabricação são opcionais. |
| Controlar saldo e vencimento para reduzir perdas | Parcial | Há saldo por lote, limites por produto e índice de apoio a FEFO. Aplicação mantém saldo, calcula disponibilidade e apresenta vencimentos. O TXT deixa em aberto como tratar lote sem validade e quais alertas gerar. |
| Fornecedores e preços por produto | Total | `fornecedor` e `produto_fornecedor` armazenam cadastro, preço corrente por par e prazo opcional. Histórico de cotações não é representado. |
| Criar e acompanhar pedidos para reposição | Parcial | Pedido, itens, custo, quantidade, datas e status existem. Aplicação define transições, verifica vínculo comercial se exigido e sincroniza recebimento e estoque. O SQL aceita item de produto sem vínculo com o fornecedor. |
| Identificar caixa, sessão e funcionário operador | Total | FKs ligam venda à sessão e sessão ao caixa e funcionário. A sessão guarda abertura, fechamento, fundo de troco e valor contado. |
| Operação contínua de vendas por sessão | Parcial | O banco aceita vendas em sessão fechada e múltiplas sessões abertas no mesmo caixa. Serviço valida elegibilidade e coordena concorrência. |
| Registrar itens, valores e subtotal | Total | `item_venda` armazena produto, quantidade e preço unitário. `subtotal` é gerado por `ROUND(quantidade * preco_unitario, 2)`. |
| Manter valor total da compra | Parcial | `venda.valor_total` é persistido com default zero. Aplicação soma subtotais dos itens sem cancelamento e grava o total a cada alteração. |
| Suportar múltiplas formas de pagamento | Total | `forma_pagamento` é um catálogo configurável. A venda pode ter várias linhas em `pagamento`, inclusive com formas diferentes. |
| Calcular troco automaticamente em dinheiro | Parcial | `troco` é gerado por `COALESCE(valor_recebido, valor) - valor`. SQL permite troco negativo e ignora `permite_troco`. A API aplica a flag e valida recebimento e composição do pagamento. |
| Cadastrar funcionários e cargos | Total | `funcionario` tem FK para `cargo`, CPF e matrícula únicos e campos cadastrais. |
| Permissões por hierarquia e autorização do supervisor | Parcial | `cargo.pode_cancelar_item` fornece uma flag. `cancelamento_item` guarda supervisor, item, motivo e data, com unicidade por item. A FK só comprova existência do funcionário. Serviço autentica o supervisor e verifica atividade e flag. Demais permissões dependem de matriz acordada. |
| Rastrear entradas, saídas de venda, estornos, perdas e ajustes | Parcial | `movimentacao_estoque` registra os cinco tipos por lote. Vínculos ao item e ao funcionário são opcionais. O saldo pode ser alterado sem histórico por DML direto. A aplicação grava ambos de forma atômica. |
| Custos unitários, ganhos por sessão e lucro futuro | Parcial | Há custos no vínculo comercial, no item de compra e no lote. Vendas e pagamentos são consultáveis por sessão. Margem bruta pode ser derivada de vendas elegíveis e custos dos lotes alocados, se houver trilha íntegra. O SQL não registra despesas, tributos ou outros componentes de lucro líquido. Confirmar o conceito de ganhos antes de publicar relatórios. |
| Emitir nota com ou sem CPF e resumo da compra | Parcial | `nota_fiscal` armazena série, chave opcional, CPF opcional e data, com uma linha por venda. O resumo pode ser derivado de venda, itens válidos e pagamentos. Cadastro e comprovante acadêmico são viáveis. |
| Autorização oficial de nota eletrônica | Ausente | O DDL não descreve integração fiscal, autorização, protocolo ou XML. Chave armazenada por si só é um dado cadastral. A aplicação acadêmica deve identificar a saída como comprovante demonstrativo. Emissão oficial fica fora do escopo atual. |
| Aplicação sem root e usuários com privilégios distintos | Ausente no arquivo | Não há contas nem concessões declaradas. Provisionamento externo pela equipe responsável, com credenciais dedicadas e privilégios mínimos. |
| Índices para consultas | Total quanto à existência | Há índices de FKs, unicidade, nome de produto, data da venda e FEFO. Desempenho e cobertura de consultas devem ser medidos na base de desenvolvimento. |
| Procedures, Functions, Triggers e Views para automação e consultas | Ausente | Nenhum desses objetos está definido. `ROUND` e `COALESCE` são chamadas em expressões de colunas geradas. Serviços e consultas parametrizadas cobrem a parte viável sem DDL. |

## Decisões pendentes

- Confirmar permissões além do cancelamento de item, transições de pedidos, recebimento parcial, política de validade e tratamento do estoque insuficiente.
- Confirmar política de pagamento e cancelamento de venda inteira. O status `CANCELADA` existe, mas o SQL não modela justificativa, autorizador ou devolução de pagamento no nível da venda. O TXT exige autorização para cancelar item durante a venda.
- Confirmar indicador financeiro e a política de ajustes. Um ajuste tem quantidade e tipo, sem coluna separada para direção. Uma convenção de sinal, se adotada, deve ser definida antes de gravar dados.
- Verificar origem e formato das credenciais existentes e disponibilidade de uma base de desenvolvimento provisionada com o schema original. O SQL entregue não inclui dados.

