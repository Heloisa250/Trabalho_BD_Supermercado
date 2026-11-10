# Sessões de caixa oficiais

Funcionário autenticado e ativo → terminal disponível → abertura → sessão ativa → conferência → fechamento.

O operador vem da sessão autenticada. Qualquer funcionário ativo pode operar um caixa ativo e disponível. Operadores consultam as próprias sessões. A lista administrativa permite consultar o histórico de outros operadores. O fechamento é exclusivo do responsável, inclusive quando o solicitante é administrador. A permissão de cancelamento de itens é independente.

A abertura usa o lock nomeado de `sessao_caixa`, bloqueia funcionário e terminal nessa ordem e verifica sessões abertas por terminal e por operador. O alocador compartilhado atribui o ID explícito antes do INSERT. A unicidade operacional depende de todos os escritores seguirem esse protocolo, pois o DDL não tem uma restrição para sessão aberta. O fechamento bloqueia a sessão antes da conferência. Os Scripts 08 e 09 devem chamar `lockOperatorSession` dentro da própria transação antes de gravar vendas ou pagamentos, validando operador, terminal e estado aberto.

A situação vem de `data_fechamento`. O fechamento grava a data do servidor e o valor contado. Vendas abertas, vendas finalizadas cujo pagamento total difere do valor da venda e pagamentos em dinheiro inconsistentes impedem o fechamento.

A forma oficial de dinheiro físico é identificada pela descrição normalizada `Dinheiro`, independentemente do ID, do indicador de troco ou do estado ativo atual. A conferência soma `pagamento.valor` das vendas finalizadas em dinheiro. Quando há valor recebido, a API compara recebido menos troco ao valor aplicado e reporta divergências. O fundo e os valores são calculados em centavos inteiros. O valor esperado e a diferença são calculados sob demanda e podem mudar em consultas históricas se os pagamentos ou sua classificação forem alterados.

As rotas oficiais usam a sessão autenticada. Escritas também exigem uma origem confiável.

| Método e caminho sob `/api/v1/sessoes-caixa` | Uso |
| --- | --- |
| GET `/` | Histórico paginado com número, terminal, operador, período, situação e ordem. |
| GET `/:id` | Sessão e conferência financeira. |
| GET `/ativa` | Sessão aberta do operador ou `null`. |
| GET `/terminais` | Terminais e disponibilidade atual. |
| POST `/abrir` | Recebe `id_caixa` e `fundo_troco`. |
| POST `/:id/fechar` | Recebe `valor_contado`. |

O provisionador inclui a escrita na criação de contas para instalações novas. Na instância oficial existente, a autorização para escrita exige o seguinte comando.

```sql
GRANT INSERT, UPDATE ON Supermercado.sessao_caixa TO 'supermercado_r03_app'@'%';
```
