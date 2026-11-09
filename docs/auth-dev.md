> Documento do ambiente legado. Para o schema oficial, consulte [Banco oficial](banco-oficial.md).

# Autenticação de funcionários

A aplicação usa bcrypt em `funcionario.senha_hash`. O hash ocupa 60 caracteres e cabe no `CHAR(64)`. Essa é a opção especificada pelo Script 02. A proposta inicial de scrypt da auditoria não foi adotada. Funcionários ativos com data de demissão ausente ou posterior à data corrente do MySQL podem entrar.

Defina `JWT_SECRET` em `backend/.env` com um segredo aleatório exclusivo de pelo menos 32 caracteres e `AUTH_TTL_SECONDS` se quiser ajustar a duração padrão de 1800 segundos. Use HTTPS com `NODE_ENV=production`. Sirva o front-end e a API no mesmo site, preferencialmente na mesma origem. No desenvolvimento, use o proxy do Vite. O cookie é restrito ao host e a sessão de `localhost` fica separada da sessão de `127.0.0.1`. Autorize em `CORS_ORIGIN` apenas as origens usadas. O limite de login é mantido em memória por processo e usa o IP observado pelo Express. Em desenvolvimento com proxy, clientes podem compartilhar o limite.

O JWT contém o identificador do funcionário. Cada acesso protegido consulta o funcionário e o cargo atuais. O logout remove o cookie do navegador. Cópias do JWT ainda válidas permanecem utilizáveis até expirar. O servidor exige uma origem autorizada nas operações de autenticação que alteram estado. A flag de cancelamento pode ser validada pelo middleware quando uma futura rota tiver carregado a sessão, e a aprovação deve ser vinculada ao item da operação.

## Bootstrap após autorização específica

Use apenas o MySQL isolado do projeto. Confirme que as matrículas e CPFs sintéticos abaixo não existem. Gere duas senhas exclusivas e hashes bcrypt de custo 12 em uma sessão Node local. Leia as senhas por entrada protegida ou por um gerenciador de senhas. No Node, use `await bcrypt.hash(senha, 12)` com o pacote `bcryptjs`. Use senhas de até 72 bytes UTF-8. Envie ao MySQL somente os hashes, por uma sessão administrativa sem histórico. A API continua com SELECT.

Execute na mesma sessão administrativa, substituindo os dois marcadores pelos hashes gerados:

```sql
USE supermercado;
START TRANSACTION;
INSERT INTO cargo (nome, descricao, pode_cancelar_item)
VALUES ('Operador demo SQLider', 'Conta de desenvolvimento', 0);
SET @operador_demo = LAST_INSERT_ID();
INSERT INTO cargo (nome, descricao, pode_cancelar_item)
VALUES ('Supervisor demo SQLider', 'Conta de desenvolvimento', 1);
SET @supervisor_demo = LAST_INSERT_ID();
INSERT INTO funcionario (id_cargo, nome, cpf, matricula, senha_hash, salario, data_admissao)
VALUES
  (@operador_demo, 'Operador demonstrativo', '00000000000', 'DEMO-OPERADOR', '<HASH_BCRYPT_OPERADOR>', 0, CURRENT_DATE),
  (@supervisor_demo, 'Supervisor demonstrativo', '11111111111', 'DEMO-SUPERVISOR', '<HASH_BCRYPT_SUPERVISOR>', 0, CURRENT_DATE);
SELECT f.matricula, c.pode_cancelar_item
FROM funcionario f JOIN cargo c ON c.id_cargo = f.id_cargo
WHERE f.matricula IN ('DEMO-OPERADOR', 'DEMO-SUPERVISOR');
```

Após confirmar as duas linhas e os valores 0 e 1, execute `COMMIT`. Em caso de erro, execute `ROLLBACK`. Os CPFs sintéticos são sequências repetidas destinadas a essa base isolada.

Com os serviços iniciados conforme o README, abra http://127.0.0.1:5175/login. Entre como operador e confirme nome e cargo no cabeçalho. Recarregue para confirmar que a sessão persiste. Saia e confirme o redirecionamento para o login. Repita com o supervisor e confira em `GET /api/v1/auth/me` que `permissoes.pode_cancelar_item` é verdadeira para o supervisor e falsa para o operador.
