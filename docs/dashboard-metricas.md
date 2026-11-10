# Script 10 — Dicionário de métricas do dashboard gerencial

Todas as métricas vêm de consultas **SELECT** parametrizadas sobre o schema oficial (`Supermercado`), sem tabelas, colunas, índices ou dados novos. O código está em `backend/src/modules/dashboard/` (`period.ts`, `repository.ts`, `routes.ts`).

## Convenções comuns

| Tema | Regra |
| --- | --- |
| Fuso | O MySQL grava `DATETIME` em UTC. Relatórios agrupam e exibem no horário de Brasília (UTC−3, deslocamento fixo; o Brasil não tem horário de verão desde 2019). Não se usa `CONVERT_TZ` com nome de região porque o container não carrega as tabelas de fuso. |
| Período | `inicio` e `fim` são datas locais **inclusivas**. A consulta usa o intervalo UTC semiaberto `[inicio 00:00 local, fim+1 00:00 local)`, ou seja `data_hora >= inicio+03:00 AND data_hora < fim+1+03:00`. Uma venda às 01:30 UTC de 05/11 pertence ao dia 04/11. Sem filtro: últimos 30 dias até hoje (local). Máximo de 366 dias; início > fim → 400. |
| Data de referência | Situação de lotes usa a data comercial (`config/business-time.ts`, America/Sao_Paulo), a mesma do Estoque e do PDV desde o Script 11. |
| Precisão | Dinheiro: `DECIMAL(10,2)` somado pelo MySQL (exato) e devolvido como texto; divisões e somas na API usam centavos inteiros (BigInt), arredondamento meio-para-cima. Quantidades: `DECIMAL(10,3)` em texto com 3 casas. `NULL` em somas vira `0`. |
| Status de venda | Faturamento, ranking, pagamentos e conferência usam **somente `FINALIZADA`**. `ABERTA` e `CANCELADA` aparecem só nos indicadores de status. |
| Item cancelado | Item com qualquer linha em `cancelamento_item` (`NOT EXISTS`) é excluído das vendas de produtos. |
| JOINs 1:N | Totais por pedido, por lote e por fornecedor são agregados em subconsultas antes do JOIN, para não multiplicar valores. |
| Acesso | `/api/v1/dashboard/*` exige sessão e matrícula em `ADMIN_MATRICULAS` (F0001). Nenhuma resposta traz CPF, `senha_hash` ou salário. |

## Indicadores

### 1. Faturamento
- **Objetivo**: receita das vendas concluídas no período.
- **Tabelas / campos**: `venda.valor_total`, `venda.status`, `venda.data_hora`.
- **Fórmula**: `SUM(valor_total)` das vendas `FINALIZADA` com `data_hora` no intervalo.
- **Filtros**: período. **Inclui**: FINALIZADA. **Exclui**: ABERTA, CANCELADA.
- **NULL**: sem vendas → `0.00`.
- **Consulta**: `SELECT status, COUNT(*), SUM(valor_total) FROM venda WHERE data_hora >= ? AND data_hora < ? GROUP BY status`.
- **Limitações**: não é recebimento financeiro (ver pagamentos) nem lucro (o DDL não liga custo ao item vendido). O período é o da criação da venda (`venda.data_hora`), não o do pagamento.

### 2. Vendas finalizadas, abertas e canceladas
- **Fórmula**: `COUNT(*)` por status no período (mesma consulta do faturamento). O card "vendas abertas agora" conta todas as ABERTA, sem período.
- **Limitação**: uma venda ABERTA sem itens (ex.: venda nº 7 aberta no PDV e ainda vazia) conta como aberta.

### 3. Ticket médio
- **Fórmula**: faturamento ÷ vendas finalizadas, em centavos, meio-para-cima. Sem vendas → `null` ("Sem vendas"), nunca divisão por zero.

### 4. Série de faturamento (diária, semanal, mensal)
- **Tabelas**: `venda`. **Fórmula**: `SUM(valor_total)` de FINALIZADA agrupado por `DATE(data_hora − 3h)`; semana = segunda-feira da semana (`WEEKDAY`); mês = dia 1.
- **Intervalos sem venda**: a API devolve `0.00` com `sem_registro: true` (barra cinza "Sem registros"). Nenhum valor é inventado.
- **Limitação**: os horários do DML oficial foram escritos como literais (ex.: `09:15`) e, pela convenção UTC, aparecem como `06:15` locais. Nenhuma venda do DML muda de dia por isso.

### 5. Produtos mais vendidos
- **Tabelas / campos**: `item_venda.quantidade`, `item_venda.subtotal`, `item_venda.preco_unitario`, `venda.status`, `produto`, `categoria`, `cancelamento_item`.
- **Fórmula**: por produto, `SUM(COALESCE(subtotal, ROUND(quantidade × preco_unitario, 2)))` e `SUM(quantidade)`; ranking por receita (desc), desempate por `id_produto`. Até 50 itens (padrão 10).
- **Inclui**: itens de vendas FINALIZADA sem cancelamento. **Exclui**: itens cancelados, vendas ABERTA e CANCELADA.
- **Preço**: sempre o gravado no item (histórico), nunca `produto.preco_venda`.
- **Unidades**: quantidades de UN, KG e L **não** são somadas entre si; há um quadro separado por unidade.
- **Filtros**: período, categoria, produto.

### 6. Pagamentos por forma
- **Tabelas / campos**: `pagamento.valor`, `valor_recebido`, `troco`; `forma_pagamento.descricao`; `venda.status`, `venda.data_hora`.
- **Fórmula**: por forma, `SUM(valor)` (aplicado), `SUM(COALESCE(valor_recebido, valor))` (recebido), `SUM(COALESCE(troco, 0))`, `COUNT(*)` pagamentos e `COUNT(DISTINCT id_venda)`.
- **Inclui**: pagamentos de vendas FINALIZADA. **Exclui**: pagamentos de vendas ABERTA/CANCELADA.
- **Dinheiro físico**: mesma regra do Script 07 (`descricao` normalizada = `Dinheiro`). O quadro mostra recebido, troco e aplicado.
- **Conciliação**: faturamento (vendas) e soma aplicada (pagamentos) são **duas medidas da mesma receita**: a API mostra as duas e a diferença, sem somá-las. Exemplo (venda nº 6): faturamento 130,38; aplicado 130,38; recebido 150,00; troco 19,62.
- **Limitação**: cartão, Pix e vale são registros demonstrativos; não há confirmação bancária no DDL.

### 7. Estoque por produto
- **Tabelas / campos**: `produto` (mínimo, máximo, unidade, ativo), `categoria`, `lote.quantidade_atual`, `lote.data_validade`.
- **Fórmula**: físico = `SUM(quantidade_atual)` dos lotes; disponível = soma dos lotes com saldo > 0 e validade nula ou ≥ hoje (zero para produto inativo); vencido = soma dos lotes com validade < hoje. Produto sem lote → `0`.
- **Situação**: `BAIXO` se físico < mínimo; `ACIMA` se físico > máximo; senão `NORMAL` (igual ao mínimo é normal).
- **Card "estoque baixo"**: produtos **ativos** com situação BAIXO.
- **Limitação**: a situação usa o saldo físico, como no Script 06; um produto com saldo todo vencido pode estar "normal" fisicamente e ter disponível zero (ex.: Banana Prata).

### 8. Alertas de lotes
- **Fórmula**: lotes com `quantidade_atual > 0`, classificados como `VENCIDO` (validade < hoje), `PROXIMO` (hoje ≤ validade ≤ hoje + dias, padrão 30) ou `SEM_VALIDADE`.
- **Card "lotes próximos do vencimento"**: contagem de `PROXIMO`.
- **Limitação**: lotes zerados não geram alerta.

### 9. Movimentações de estoque
- **Tabelas**: `movimentacao_estoque`, `lote`, `produto`, `funcionario` (só matrícula).
- **Fórmula**: lista paginada (20) e totais por tipo e unidade: `COUNT(*)`, `SUM(quantidade)`, soma das positivas e das negativas.
- **Sinais**: ENTRADA, SAIDA_VENDA e PERDA são gravadas positivas; AJUSTE é gravado com sinal (+ ou −).
- **Filtros**: período, produto, lote, tipo. PERDA não é venda; ENTRADA não é faturamento.

### 10. Pedidos de compra
- **Tabelas / campos**: `pedido_compra` (status, `data_pedido`, `data_prevista`), `item_pedido_compra` (quantidade, `custo_unitario`).
- **Fórmula**: valor do pedido = `SUM(ROUND(quantidade × custo_unitario, 2))` dos itens (mesma regra do Script 05), agregado por pedido antes de juntar. Contagem e valor por status no período (`data_pedido`). Valor estimado = soma dos não cancelados.
- **Aguardando recebimento**: PENDENTE e ENVIADO (sem período), com "atrasado" para ENVIADO com prevista < hoje.
- **Limitação**: o custo é o histórico do item do pedido, nunca `produto_fornecedor.preco_custo`. Compras não são faturamento.

### 11. Fornecedores
- **Fórmula**: por fornecedor, pedidos por status no período, valor sem cancelados, valor recebido, produtos vinculados (`produto_fornecedor`).
- **Atraso**: pedido RECEBIDO com `data_prevista` e data local de recebimento posterior à prevista. Pedidos sem data prevista não entram (coluna "com prazo").
- **Limitação**: não há medida de qualidade, devolução ou quantidade conferida no DDL; nenhuma nota de desempenho é inventada.

### 12. Sessões de caixa e operadores
- **Tabelas**: `sessao_caixa`, `caixa`, `funcionario` (nome, matrícula), `venda`, `pagamento`, `forma_pagamento`.
- **Conferência**: **a mesma função `cashConference` do Script 07**. Esperado = fundo + dinheiro aplicado em vendas FINALIZADA; diferença = contado − esperado. Vendas ABERTA não contam como dinheiro.
- **Sessões listadas**: abertas (sempre) e abertas no período; até 50. Os pagamentos de todas as sessões vêm numa única consulta (sem N+1).
- **Operadores**: sessões abertas no período e vendas FINALIZADA no período pela relação `venda → sessao_caixa.id_operador`. Quem autorizou um cancelamento não recebe a venda.

## Verificação

- `backend/tests/dashboard.test.ts`: período/fuso, séries, ticket, situação de estoque, montagem das respostas e segurança HTTP (401, 403 para não administrador, filtros inválidos, injeção, ausência de campos sensíveis, somente SELECT).
- `backend/tests/integration/dashboard-sql.ts`: carrega DDL + DML oficiais numa instância **descartável**, acrescenta fixtures (`QA-S10`) e confere cada indicador contra valores calculados à mão, lendo com uma conta que só tem `SELECT`.

```bash
docker run -d --name s10-descartavel -e MYSQL_ROOT_PASSWORD=<senha> -p 127.0.0.1:3320:3306 mysql:8.4.13
S10_DB_PORT=3320 S10_ROOT_PASSWORD=<senha> npx tsx tests/integration/dashboard-sql.ts
docker rm -f s10-descartavel
```

- No banco oficial, os valores da API foram comparados com consultas independentes (ver relatório do Script 10).
