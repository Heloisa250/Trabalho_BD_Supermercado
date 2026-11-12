> Documento do ambiente legado. Para o schema oficial, consulte [Banco oficial](banco-oficial.md).

# Administração de desenvolvimento

A administração depende de uma lista explícita de matrículas ativas em `ADMIN_MATRICULAS`, separadas por vírgula no `backend/.env`. O padrão vazio bloqueia todas as operações administrativas. A autorização de cancelamento do cargo é independente dessa lista. Matrículas reservadas pela configuração não podem ser cadastradas pela API e as contas administrativas ficam protegidas de edições administrativas. O titular pode alterar sua própria senha.

## Habilitação após autorização

1. Defina explicitamente qual matrícula ativa será administradora. Configure `ADMIN_MATRICULAS=<matrícula autorizada>` e reinicie o back-end.
2. Após autorização específica para os privilégios, abra uma sessão administrativa no container isolado com `docker compose exec mysql mysql -uroot -p`. Confirme a conta com `SHOW GRANTS FOR 'supermercado_app'@'%';` e aplique somente:

```sql
GRANT INSERT, UPDATE ON supermercado.funcionario TO 'supermercado_app'@'%';
GRANT INSERT, UPDATE ON supermercado.cargo TO 'supermercado_app'@'%';
GRANT INSERT, UPDATE ON supermercado.caixa TO 'supermercado_app'@'%';
GRANT INSERT, UPDATE ON supermercado.forma_pagamento TO 'supermercado_app'@'%';
```

3. Inicie os serviços conforme o README. Entre no portal com a matrícula autorizada e use a barra lateral.
4. Em **Cargos**, crie um cargo de teste, edite a permissão de cancelamento e use **Funcionários** na linha do cargo para ver os vínculos.
5. Em **Funcionários**, cadastre um funcionário de teste com o cargo criado. Teste busca, filtros, detalhes, edição e desativação lógica. CPF e salário aparecem somente nos detalhes e na edição autorizada.
6. Em **Terminais de caixa**, cadastre um número ainda não utilizado, edite a descrição e teste o controle de situação. Um caixa com sessão aberta não pode ser desativado. O futuro fluxo de abertura deve bloquear a mesma linha de caixa e validar sua atividade antes de criar a sessão.
7. Em **Formas de pagamento**, crie uma descrição única, configure se permite troco e teste a mudança de situação.
8. Entre como um funcionário de teste e use **Alterar senha**. Informe a senha atual e uma nova de pelo menos 12 caracteres, com letras e números ou símbolos. Saia e entre com a nova senha. Os JWTs existentes mantêm sua validade até expirar.

Os testes automatizados de escrita usam um pool isolado, sem mudanças nos registros originais de desenvolvimento. Antes dos privilégios adicionais, as escritas reais e a alteração de senha permanecem indisponíveis.
