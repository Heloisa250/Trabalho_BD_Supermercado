# Guia do professor — Supermercado Qualidade Líder

## Preparar o computador

Instale Git, Node.js **22.12 ou superior** com npm e **MySQL Community Server 8.4** nativo. O MySQL Workbench é opcional para inspecionar as rotinas. No MySQL Configurator, crie uma instância acadêmica com diretório de dados e porta próprios, de preferência `3307`, acessível apenas localmente. Guarde a senha administrativa dessa instância. Abra a pasta do projeto no VS Code e execute os comandos no terminal integrado. [Instalação do MySQL para Windows](https://dev.mysql.com/doc/refman/8.4/en/windows-choosing-package.html)

```powershell
npm.cmd ci
npm.cmd run demo:setup
npm.cmd run demo:start
```

No setup, informe a porta, a conta administrativa, confirme o destino e digite a senha no prompt protegido. O instalador verifica o servidor antes de gravar, importa os arquivos na [ordem do guia do banco](../database/GUIA-BANCO.md), gera as senhas das contas técnicas e o JWT local e verifica os dois hashes acadêmicos. A API usa `backend/.env.official`. Para uma sessão de consulta no Workbench use a conta registrada em `backend/.env.academic-read`. Ambos são locais e ignorados pelo Git.

O comando `demo:start` inicia a API em `127.0.0.1:3002` e o React em [http://127.0.0.1:5176](http://127.0.0.1:5176/). Para iniciar em terminais separados, use `npm.cmd run dev -w backend -- --official` e `npm.cmd run dev:official -w frontend`.

| Perfil | Matrícula | Senha | Acesso |
|---|---|---|---|
| Administrador | F0001 | 001 | Dashboard, catálogo, compras, estoque, administração e PDV. |
| Supervisora | F0002 | 002 | PDV e operações próprias de caixa. Pode autorizar cancelamento de item de outro operador se o cargo permitir. Recebe HTTP 403 nas rotas administrativas. |

O login consulta funcionário ativo, usuário e grupo. A senha é verificada com bcrypt e a sessão usa JWT em cookie HttpOnly. Administração exige grupo ADMINISTRADOR e matrícula na lista local. O grupo SUPERVISOR não substitui a regra de cargo para cancelamento. As credenciais acima servem para a demonstração local.

## Roteiro de inspeção

1. Entre como F0001 e abra Dashboard, Produtos, Compras, Estoque e Sessões de caixa. Para ver a série histórica, selecione de 03/11/2026 a 06/11/2026. A série consulta a view de vendas finalizadas.
2. Acesse o PDV. A base inclui cinco vendas e duas autorizações de cancelamento. A sessão aberta da carga pertence a um operador de exemplo. Use um terminal disponível para abrir a própria sessão. Para autorizar um cancelamento como F0002, faça a venda com outra matrícula.
3. Entre como F0002 e confira o perfil e a navegação. O dashboard e os cadastros administrativos ficam protegidos.
4. No Workbench, abra uma conexão local com a conta de leitura para as consultas abaixo. Para inspecionar o catálogo completo ou realizar os testes de escrita reversíveis do [Script 13](../database/GUIA-SCRIPT-13.md), use a conta instaladora na instância acadêmica.

```sql
USE Supermercado;
SELECT CURRENT_USER();
SHOW GRANTS;
SELECT * FROM vw_vendas_finalizadas ORDER BY id_venda;
SELECT * FROM vw_estoque_produtos ORDER BY id_produto;
SELECT fn_calcular_subtotal(3, 28.90), fn_calcular_troco(130.38, 150.00);
CALL sp_consultar_estoque_produto(5, '2026-11-10');
CALL sp_consultar_venda(3);
SELECT f.matricula, u.codigo_grupo, c.pode_cancelar_item
FROM usuarios u JOIN funcionario f USING(id_funcionario) JOIN cargo c USING(id_cargo)
ORDER BY f.matricula;
SHOW INDEX FROM venda;
EXPLAIN SELECT SUM(valor_total) FROM venda
WHERE status = 'FINALIZADA' AND data_hora >= '2026-11-03' AND data_hora < '2026-11-05';
```

A base oficial traz **19 tabelas e 98 linhas**, com valores de exemplo para catálogo, fornecedores, compras, lotes, caixa e vendas. Os complementos acrescentam duas tabelas de perfis, duas views, duas functions, três procedures, dois triggers e dois índices. A preparação das senhas acadêmicas usa `credenciais_demo.sql`. [Guia do banco](../database/GUIA-BANCO.md)

## Diagnóstico

- Se a conexão for recusada, confirme a porta e se o serviço MySQL acadêmico está ativo. A conta instaladora precisa criar os objetos e conceder acesso às contas técnicas.
- Se o destino tiver objetos ou contas acadêmicas, rode `npm.cmd run demo:verify` com a configuração existente. Para uma nova instalação, use outra instância isolada e outro clone sem arquivos locais. O instalador preserva instalações existentes.
- Se o setup parar durante um DDL, use o nome do arquivo e o código do erro exibidos para conferir o catálogo. Use um destino acadêmico limpo para repetir a instalação.
- Verifique [health](http://127.0.0.1:5176/api/v1/health) e [ready](http://127.0.0.1:5176/api/v1/ready). Se as portas 3002 ou 5176 estiverem ocupadas, encerre a outra instância antes de iniciar a demonstração.
- Se o login retornar 401, confirme os zeros iniciais das senhas e execute `npm.cmd run demo:verify`. Abra a aplicação pelo endereço `127.0.0.1` indicado para que a origem corresponda à configuração de CORS e CSRF.
