# Arquitetura

O projeto mantém o monorepo npm com `backend/` e `frontend/`. A autoridade para a estrutura é o [DDL oficial](banco-oficial.md). As rotas atuais seguem conectadas ao legado durante a revalidação. A [matriz de diferenças](comparacao-schemas.md) separa as correções dos módulos existentes e o trabalho futuro.

O Express expõe REST em `/api/v1`. Controllers validam entradas com Zod e chamam serviços, que concentram autorização, regras e transações. Repositórios usam `mysql2/promise`, SQL parametrizado e a mesma conexão nas operações transacionais. Os middlewares centralizam sessão, permissões, CORS, CSRF e erros. O React usa Vite, React Router, TanStack Query e Tailwind para navegação e dados da API.

## Infraestrutura e segurança

A nova instância usa schema `Supermercado` no MySQL Linux. O R01 deve configurar o destino por ambiente e validar a grafia, a conta dedicada e os endpoints de saúde antes de qualquer troca. Segredos permanecem em arquivos locais ignorados. Privilégios de escrita são concedidos por tabela após autorização. Sem ORM de sincronização ou migrações estruturais.

Manter JWT em cookie HttpOnly, bcrypt e verificação atual de funcionário e cargo no banco. A lista `ADMIN_MATRICULAS` é explícita por ambiente. Supervisão para cancelamento é independente. Contas de exemplo com SHA2-256 exigem provisionamento bcrypt autorizado, sem mecanismo permanente de login pelo hash antigo.

## Escrita e concorrência

Para IDs explícitos, usar um alocador reutilizável. Adquirir `GET_LOCK` por schema e tabela em conexão dedicada do pool antes de iniciar a transação e consultar o maior ID. Inserir com o próximo ID e manter o lock até commit ou rollback. Verificar aquisição igual a 1, aplicar timeout curto e rejeitar valores acima de 2147483647. Liberar em bloco de limpeza na mesma conexão. Se a liberação falhar, descartar a conexão para impedir a volta de um lock ao pool. Usar ordem fixa quando houver múltiplos locks.

O lock coordena escritores que usam o protocolo na mesma instância. A PK protege contra colisões de escritores externos, que podem provocar erro de duplicata. Tratar colisões, timeout e deadlock com erro controlado. Validar em testes concorrentes. Unicidades funcionais removidas do DDL exigem verificação em transação sob lock comum entre cadastro e edição, respeitando a collation em uso.

Bloquear o pedido antes de editar itens ou estado. Bloquear o caixa antes de abrir sessão ou desativá-lo. Recebimento e finalização de venda exigem transações que mantenham saldo e histórico juntos. As fronteiras detalhadas serão validadas por módulo.

## Valores e testes

Manter DECIMAL como texto no driver e no JSON. Usar cálculo decimal exato ou inteiros escalados. Calcular subtotal e troco explicitamente em vendas. Em compras, somar subtotais arredondados, sem persistir total no cabeçalho. Preservar DATE e definir interpretação de DATETIME em R01.

Separar testes isolados de testes HTTP e SQL reais. Antes da troca de ambiente, validar catálogo, grants, autenticação, concorrência, escrita, interfaces e regressão no banco oficial. Registrar os hashes dos arquivos e manter o ambiente legado disponível para retorno.


## R03 — administração oficial

O perfil oficial usa um alocador com conexão exclusiva e lock por tabela para funcionários. Cargos, caixas e formas de pagamento continuam com AUTO_INCREMENT. Cargos e formas de pagamento preservam a unicidade funcional com lock por tabela durante checagem e escrita. A regra cobre os escritores que adotam o protocolo. As PKs, FKs e UNIQUE do DDL continuam como proteção do banco.

## Módulos operacionais e relatórios (Scripts 05–10)

| Módulo | Back-end | Front-end | Escrita |
| --- | --- | --- | --- |
| Compras (05) | `modules/purchases` | `PurchasesPage` | `pedido_compra`, `item_pedido_compra` |
| Estoque (06) | `modules/stock` (lock `estoque`) | `StockPage`, `ReceiveOrder` | `lote`, `movimentacao_estoque` |
| Caixa (07) | `modules/cash` (`cashConference`) | `CashSessionsPage` | `sessao_caixa` |
| PDV (08) | `modules/sales` (lock `venda`) | `PdvPage` | `venda`, `item_venda`, `cancelamento_item` |
| Finalização (09) | `modules/sales/checkout.ts` (locks `venda` → `estoque`) | `PdvPayment` | `pagamento`, `lote`, `movimentacao_estoque`, `venda` |
| Dashboard (10) | `modules/dashboard` | `DashboardPage` (Recharts) | nenhuma: somente SELECT |

O dashboard reutiliza a regra de dinheiro físico e a conferência do Script 07, o arredondamento por item do Script 05 e a aritmética decimal do Script 08. Consultas agregam relações 1:N em subconsultas antes do JOIN. Datas: gravação em UTC, apresentação em UTC−3 (ver [dicionário de métricas](dashboard-metricas.md)).
