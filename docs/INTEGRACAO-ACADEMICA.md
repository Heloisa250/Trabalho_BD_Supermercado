# Integração acadêmica com MySQL nativo

O instalador grava `ACADEMIC_DEMO=1` no arquivo local da API em modo oficial. Isso permite usar os complementos na instalação acadêmica e manter os ambientes oficiais anteriores compatíveis.

| Objeto SQL | Caminho na aplicação | Decisão e risco controlado |
|---|---|---|
| `vw_vendas_finalizadas` | `GET /api/v1/dashboard/vendas/serie`, `dashboard/repository.ts`, `revenueSeries` | A série usa a view com intervalo UTC semiaberto e o agrupamento civil existente para dia, semana e mês. O contrato JSON permanece. Ranking e quantidade por produto continuam a excluir cancelamentos por item nas consultas atuais. |
| `vw_estoque_produtos` e `sp_consultar_estoque_produto` | `GET /api/v1/estoque/produtos/:id`, `stock/routes.ts` | O endpoint administrativo parametriza ID e data comercial e lê o primeiro conjunto do `CALL`. Um ID válido sem produto retorna 404. A listagem original continua com paginação, vencidos e alertas. |
| `usuarios`, `grupos_usuarios` | `auth/repository.ts`, `auth/service.ts`, `admin/routes.ts`, `cash/routes.ts` | Os vínculos válidos são verificados tanto no login quanto na recuperação de sessão. Administração exige grupo e lista local. Cancelamento exige grupo habilitado, bcrypt, cargo autorizado e pessoa distinta. O cadastro em `admin/repository.ts` cria o vínculo OPERADOR na mesma transação do funcionário. |
| `fn_calcular_subtotal`, `fn_calcular_troco` | `sales/decimal.ts`, `sales/checkout.ts` | O PDV conserva cálculo decimal com inteiros e suas validações de pagamento. Os exemplos SQL equivalentes são 86,70 e 19,62. As functions ficam disponíveis para inspeção e conferência no Workbench. |
| `sp_consultar_venda` | `sales/repository.ts`, `sales/service.ts` | Consulta demonstrativa no Workbench. O detalhe operacional conserva a verificação de titularidade da sessão, permissões e contrato de itens e pagamentos. A procedure atual recebe só o ID da venda e retorna quatro conjuntos. |
| `sp_registrar_ajuste_lote` | `stock/routes.ts`, `config/mysql-transaction.ts` | Ajuste demonstrativo isolado via Workbench. A API mantém o ajuste existente, inclusive o contrato de motivo e os erros HTTP. Os dois caminhos usam o lock de estoque, atualizam saldo e registram uma única movimentação por operação. A procedure possui seu próprio commit e deve ser chamada fora de transação do chamador. |
| Triggers de lote e índices | Escritas do estoque e consultas SQL | Triggers rejeitam quantidade negativa e datas invertidas. Índices apoiam vendas e movimentações sem mudar o resultado das consultas. |

Consulta utilizada na série acadêmica, com o mesmo agrupamento do repositório:

```sql
SELECT <agrupamento civil de data_hora> AS periodo,
       COUNT(*) AS vendas, SUM(valor_total) AS faturamento
FROM vw_vendas_finalizadas
WHERE data_hora >= ? AND data_hora < ?
GROUP BY periodo ORDER BY periodo;
```

A proteção de rotas mantém bcrypt, JWT, cookie HttpOnly, CORS e validação de origem em mutações. A conta da API pode inserir o vínculo de novos funcionários como OPERADOR pelo fluxo de cadastro. A atualização administrativa de vínculos permanece na conta instaladora. O endpoint de sessão nunca devolve o hash.

## Histórico e publicação

A versão acadêmica gera senhas técnicas distintas e um JWT local em arquivos ignorados. O histórico herdado contém versões antigas de arquivos de credenciais e chaves de backup. A remoção na árvore atual não prova a revogação. Antes de publicar uma nova referência com esse histórico, confirme a rotação ou revogação das credenciais e das chaves antigas e o tratamento dos backups afetados. Uma publicação a partir de uma árvore revisada, sem esse histórico, requer uma decisão explícita de distribuição.

## Evidência em MySQL 8.4.13 nativo

A instalação limpa executou os 13 arquivos na ordem documentada. O setup confirmou 21 tabelas, 27 FKs, duas views, duas functions, três procedures, dois triggers e dois índices. A carga oficial tinha 98 linhas. A segunda tentativa com configuração existente foi recusada. `demo:verify` e `demo:start` passaram.

Para o período de 03/11/2026 a 06/11/2026, o endpoint retornou:

```json
{
  "agrupamento": "dia",
  "pontos": [
    {"periodo":"2026-11-03","vendas":2,"faturamento":"62.99","sem_registro":false},
    {"periodo":"2026-11-04","vendas":1,"faturamento":"87.77","sem_registro":false},
    {"periodo":"2026-11-05","vendas":0,"faturamento":"0.00","sem_registro":true},
    {"periodo":"2026-11-06","vendas":0,"faturamento":"0.00","sem_registro":true}
  ]
}
```

A agregação direta de `venda` coincidiu com os dias com vendas. Semana e mês também somaram três vendas. Renomear temporariamente a view na instância de teste fez o endpoint falhar até a restauração da view, confirmando a dependência real.

A API respondeu em health, ready, login, sessão, logout, dashboard, catálogo, estoque, compras, caixa e PDV. A procedure de estoque foi chamada com sucesso e retornou 404 para produto inexistente. Foram negados senha incorreta, JWT inválido, origem inválida, funcionário inativo, usuário sem vínculo, grupo inexistente por FK e acesso administrativo de supervisora. Um funcionário criado pela API recebeu OPERADOR e autenticou. Esse operador não conseguiu autorizar cancelamento. F0002 autorizou um cancelamento real no PDV de F0001, com um único registro gravado.

Chrome em 1440 × 900 exibiu erro de senha, login, dashboard, catálogo, estoque e PDV. Em 390 × 844, foram conferidos login de F0002, menu e PDV sem overflow horizontal na página. Não houve exceção JavaScript nos fluxos testados. O build dos dois workspaces e os 42 testes automatizados passaram. O banco pessoal e o DDL e DML oficiais ficaram intactos.
