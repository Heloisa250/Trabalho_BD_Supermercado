# Comparação entre o banco legado e o DDL oficial

Os dois modelos têm 19 tabelas e 25 FKs. Isso preserva parte das consultas, mas não garante compatibilidade de gravação.

| Área | Diferença e impacto | Etapa |
| --- | --- | --- |
| Conexão | `backend/src/config/database.ts` fixa `supermercado`. No servidor Linux oficial, usar `Supermercado` com a grafia do DDL. Separar configuração e credenciais por ambiente. | R01 |
| Login | `auth/service.ts` verifica bcrypt. O DML oficial armazena SHA2-256. Reset explícito e separado para bcrypt no novo ambiente. As matrículas da base antiga não identificam administradores automaticamente na base nova. | R02 |
| Funcionários, fornecedores e produtos | `admin/repository.ts` usa `insertId` para todos os cadastros. No oficial, fornecer os respectivos IDs em transação. | R03/R04 |
| Defaults de cadastros | `admin/schemas.ts` e `admin/service.ts` permitem omitir campos hoje preenchidos pelo legado. Informar `ativo` de funcionário, caixa, forma, produto e fornecedor. Produto precisa de unidade e ambos os limites de estoque. O formulário já preenche alguns, mas a API precisa ser consistente. | R03/R04 |
| Unicidade de cadastros | Nome de cargo, categoria e marca, e descrição da forma de pagamento deixam de ser UNIQUE. `admin/routes.ts` depende de erro de duplicata do MySQL. Preservar a política funcional com checagem sob bloqueio nas criações e alterações. Adaptar a tradução de erros aos nomes de índices oficiais. | R03/R04 |
| Produtos | `admin/schemas.ts`, `adminFields.ts` e testes aceitam cinco unidades no legado. O oficial aceita somente UN, KG e L. Código de barras e CNPJ continuam únicos. O vínculo comercial mantém a PK composta. | R04 |
| Compras | A implementação existe em `backend/src/modules/purchases`, `PurchasesPage.tsx` e `purchases.test.ts`. Usa ABERTO, ID automático e defaults de data e estado. Migrar para PENDENTE, ID explícito, data e estado informados. Chave composta do item e consulta de custo permanecem válidas. | 05 |
| Lotes | ID explícito, datas e quantidades obrigatórias conforme DDL. O par produto-código passa a ser UNIQUE. A FK composta para item do pedido permanece. | 06 |
| Estoque | ENUM oficial usa ENTRADA, SAIDA_VENDA, AJUSTE e PERDA. Definir correções via AJUSTE com sinal e observação vinculados ao motivo e ao item quando aplicável. Confirmar a convenção antes de escrever. | 06/08 |
| Sessão e venda | IDs, horários, valores obrigatórios e estado da venda são explícitos. Revisar totais e concorrência. | 07/08 |
| Subtotal e troco | Colunas DECIMAL comuns e anuláveis. Calcular e persistir explicitamente. A aplicação também valida arredondamento por linha, recebimento e permissão de troco. | 08/09 |
| Nota e cancelamento | A chave fiscal continua única. O vínculo nota-venda e cancelamento-item perdem a unicidade. Se a regra de uma ocorrência for mantida, validar sob bloqueio no pai. | 08/09 |
| Índices e collation | O DDL oficial não declara os índices auxiliares do legado, como FEFO e data de venda. A collation é herdada do servidor. Medir consultas e usar critérios de ordenação explícitos. | R01/06/10 |

O catálogo, a administração e a autenticação ainda apontam para a base legada. Builds anteriores não validam a gravação no DDL oficial.
