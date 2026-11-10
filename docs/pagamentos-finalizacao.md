# Script 09 — Pagamentos, finalização de vendas e baixa de estoque

Fluxo: **venda ABERTA → Ir para pagamento → rascunho de pagamentos (só na tela) → Confirmar → uma transação (pagamentos + baixa FEFO + SAIDA_VENDA + FINALIZADA) → comprovante demonstrativo.**

## Contrato financeiro (`pagamento`)

Todos os valores são processados em centavos inteiros (BigInt), no servidor e no React.

| Campo | Significado | Regra |
| --- | --- | --- |
| `valor` | Parte do total da venda quitada por esta forma | > 0, até 2 casas, nunca acima do saldo restante. |
| `valor_recebido` | Quanto o cliente entregou | Dinheiro físico: ≥ `valor`. Demais formas: igual a `valor` (mesmo padrão dos pagamentos históricos do DML). |
| `troco` | Devolvido ao cliente | `valor_recebido − valor`. Só pode ser > 0 em dinheiro físico. Nas demais formas é `0.00`. |

Invariantes verificados pelo servidor: soma de `valor` = total dos itens ativos (diferença de 1 centavo é rejeitada); `valor_recebido − troco = valor` em cada linha; total da venda recalculado a partir dos itens não cancelados e comparado ao `valor_total` gravado (divergência → `409 TOTAL_MISMATCH`).

**Dinheiro físico** é a regra do Script 07 (`descricao` normalizada = `Dinheiro`, constante `CASH_FORM_SQL`). Troco exige ser dinheiro físico **e** `permite_troco = 1`; uma forma com `permite_troco = 1` que não é dinheiro não aceita troco. Assim a conferência de caixa soma exatamente o `valor` aplicado em dinheiro.

Cada forma aparece uma única vez por venda (máximo 5 formas). Formas inativas ou inexistentes são rejeitadas. Cartão, Pix e Vale são **confirmações demonstrativas**: não há cobrança, adquirente, captura de cartão nem integração Pix; nenhum dado de cartão é aceito (campos extras → 400).

Como `pagamento` não tem status, nada é gravado enquanto o operador monta a composição: o rascunho vive só no React. Tudo é gravado de uma vez na confirmação.

## Baixa de estoque (FEFO)

Para cada item **não cancelado** (em ordem de `id_item_venda`), a quantidade é distribuída entre os lotes elegíveis do produto:

1. Elegível: `quantidade_atual > 0` e validade nula ou ≥ hoje (lotes vencidos nunca são usados).
2. Ordem: validade mais próxima primeiro; **lotes sem validade por último** (não vencem, então os perecíveis saem antes); desempate por `data_entrada` e depois `id_lote`.
3. Um item pode consumir vários lotes; cada lote usado gera uma movimentação `SAIDA_VENDA` com quantidade positiva, `id_item_venda`, `id_funcionario` do operador e observação `Venda #N`. A soma das movimentações do item é igual à quantidade vendida.
4. `quantidade_atual` recebe o saldo final calculado em milésimos exatos; `quantidade_inicial` não muda. Saldo negativo é impossível (falta → `409 INSUFFICIENT_STOCK` e rollback).
5. Produto inativo na hora da finalização bloqueia a venda.

## Transação e concorrência

`POST /vendas/:id/finalizar` executa tudo em **uma transação**:

1. Locks nomeados, sempre nesta ordem: `sqlider:Supermercado:venda` (PDV) → `sqlider:Supermercado:estoque` (estoque e alocador de `movimentacao_estoque`).
2. `sessao_caixa` FOR UPDATE → valida operador, sessão aberta, funcionário ativo e terminal ativo.
3. `venda` FOR UPDATE → exige ABERTA.
4. `item_venda` FOR UPDATE → itens ativos, total recalculado, ausência de pagamentos e movimentações anteriores.
5. Validação dos pagamentos.
6. `lote` FOR UPDATE de todos os produtos, em ordem crescente de `id_lote`.
7. IDs explícitos (`nextExplicitId`) para `pagamento` e `movimentacao_estoque`.
8. INSERT pagamentos → UPDATE lotes + INSERT SAIDA_VENDA → `UPDATE venda SET status='FINALIZADA' WHERE status='ABERTA'` → COMMIT.

Qualquer falha faz ROLLBACK: nenhum pagamento parcial, nenhuma baixa parcial, nenhuma movimentação órfã, status inalterado. Os locks são liberados em `finally` (ordem inversa).

- **Finalização duplicada / F5**: a segunda requisição espera o lock, encontra a venda FINALIZADA e recebe `409 SALE_NOT_OPEN` sem gravar nada. No React, uma trava síncrona impede que um duplo clique envie duas requisições. Em caso de erro, o React consulta o estado real da venda antes de oferecer nova tentativa.
- **Perdas e ajustes (Script 06)** usam só o lock de estoque; a finalização o pede depois do lock do PDV. Nenhum fluxo pede os dois na ordem inversa, então não há espera circular. Uma perda aplicada entre a inclusão do item e o pagamento é vista na revalidação e gera `INSUFFICIENT_STOCK`.
- **Fechamento de caixa (Script 07)** bloqueia a mesma linha de `sessao_caixa`; ele espera a finalização terminar (ou vice-versa) e continua recusando fechar com venda ABERTA.
- **Limitação**: escritores externos que não usem esses locks não são impedidos pelo DDL.

## Datas e fuso

O MySQL oficial roda em UTC (`@@system_time_zone = UTC`) e os módulos anteriores gravam `CURRENT_TIMESTAMP` nessa convenção. A API devolve `DATETIME` como texto sem fuso (`dateStrings: true`). O PDV e o comprovante interpretam esse texto como UTC e exibem no fuso do navegador (ex.: `13:14:34` gravado → `10:14:34` em Brasília). Timestamps históricos não são alterados. As telas anteriores (sessões de caixa, estoque) ainda exibem o valor gravado sem conversão.

## Comprovante e nota fiscal

`GET /vendas/:id/comprovante` (só para venda FINALIZADA) traz supermercado, venda, terminal, operador, data/hora, itens (cancelados identificados), total, formas, recebido e troco, com o aviso **COMPROVANTE DEMONSTRATIVO — SEM VALOR FISCAL**. A tela permite imprimir apenas o comprovante. A emissão fiscal (NFC-e/SEFAZ) está **fora do escopo**: nenhuma linha é inserida em `nota_fiscal` e nenhuma chave de acesso é gerada.

## API (`/api/v1/vendas`, sessão obrigatória; escrita exige origem confiável)

| Método e caminho | Uso |
| --- | --- |
| GET `/:id/pagamento/resumo` | Total recalculado, itens ativos, formas ativas (com indicação de troco), pagamentos e saldo. Substitui, para o operador, a rota administrativa de formas de pagamento. |
| POST `/:id/finalizar` | `{ "pagamentos": [{ "id_forma_pagamento": 1, "valor": "130.38", "valor_recebido": "150.00" }] }`. Status, total, lotes, operador e preços são decididos pelo servidor; campos extras → 400. |
| GET `/:id/pagamentos` | Pagamentos gravados. |
| GET `/:id/comprovante` | Comprovante demonstrativo. |

## Privilégios MySQL

Novo para este script, **somente**:

```sql
GRANT INSERT ON Supermercado.pagamento TO 'supermercado_r03_app'@'%';
```

`lote` (INSERT, UPDATE), `movimentacao_estoque` (INSERT), `venda`/`item_venda` (INSERT, UPDATE) já existem. Sem UPDATE/DELETE em `pagamento`. Nenhum bloqueio de linha é feito em tabelas onde a conta só tem INSERT (`pagamento`, `movimentacao_estoque`, `cancelamento_item`).

## Validação isolada

`backend/tests/integration/isolated-checkout.ts` roda contra uma **cópia descartável** do banco oficial (container próprio, porta ≠ 3307) com a conta da aplicação limitada aos grants oficiais + `INSERT` em `pagamento`:

```bash
S09_DB_PORT=3319 S09_DB_PASSWORD=... npx tsx tests/integration/isolated-checkout.ts
```

Para testar a interface contra essa cópia sem tocar no ambiente oficial, rode uma segunda API (diretório com `.env.official` apontando para a cópia, `PORT=3012`) e `FRONTEND_PORT=5177 FRONTEND_API_TARGET=http://127.0.0.1:3012 vite --mode official`.
