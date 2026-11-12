# R02 — autenticação oficial

A API oficial na porta 3002 usa `sqlider_official_session` e audiência JWT `funcionario-oficial`. A API legada usa `sqlider_session` e audiência `funcionario`. Os perfis têm segredos locais separados. O login e o logout mantêm a exigência de origem confiável. No perfil oficial, as origens padrão são `http://localhost:5176` e `http://127.0.0.1:5176`.

Os endpoints permanecem `POST /auth/login`, `GET /auth/me`, `POST /auth/logout` e `POST /auth/change-password`, todos sob `/api/v1`. A busca de login usa matrícula e revalida atividade e data efetiva de demissão. A resposta exclui CPF, salário e hash. A lista `ADMIN_MATRICULAS` do ambiente oficial fica vazia até autorização explícita. O cargo de F0001 torna essa conta uma candidata para o laboratório, mas o cargo não concede acesso administrativo.

Os cinco funcionários F0001 a F0005 foram importados com SHA2-256. A API responde com o mesmo erro genérico de credenciais inválidas usado para matrículas desconhecidas. O provisionamento pontual usa bcrypt de custo 12 e altera apenas `senha_hash`. A API continua usando a conta SELECT `supermercado_r01`. A troca de senha pelo endpoint oficial exige uma futura concessão específica de atualização à conta da API.

## Provisionamento após autorização

Na instância oficial de porta 3307, após autorização para a conta e para a matrícula selecionada, crie `supermercado_r02_provision`@'%' com senha exclusiva e conceda somente os acessos abaixo. Use o cliente administrativo do container, sem guardar a senha administrativa no perfil da API.

```sql
CREATE USER 'supermercado_r02_provision'@'%' IDENTIFIED BY '<senha exclusiva>';
GRANT SELECT (id_funcionario, matricula, senha_hash), UPDATE (senha_hash)
ON Supermercado.funcionario TO 'supermercado_r02_provision'@'%';
SHOW GRANTS FOR 'supermercado_r02_provision'@'%';
SELECT @@server_uuid;
```

Obtenha o UUID diretamente do container `supermercado-qualidade-lider-oficial-dev-mysql-1`. Execute na raiz, em terminal interativo:

```sh
npm run provision:official-password -w backend -- F0001
```

O CLI lê a credencial dedicada e o UUID de `backend/.env.r02-provision`, ignorado pelo Git. Pede a nova senha e sua confirmação sem eco. Valida porta 3307, schema, UUID, matrícula F0001 e formato legado. A atualização é parametrizada e condicionada ao hash anterior para detectar alteração concorrente. O comando aceita uma matrícula por execução e rejeita uma conta que já tenha sido convertida. Após a operação, a equipe pode revogar a credencial de provisionamento conforme o plano autorizado.

## Verificação com React

Use http://localhost:5176/ com Vite encaminhando `/api/v1` à porta 3002. O React reaproveita as páginas atuais e recupera a sessão pelo cookie HttpOnly. A validação de login bem-sucedido, persistência após recarregar e logout no ambiente oficial requer uma credencial bcrypt autorizada. O diagnóstico sem sessão e as rejeições são verificáveis antes do provisionamento.
