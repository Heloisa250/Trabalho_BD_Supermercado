# Banco oficial

Os quatro arquivos em `official/` já vêm no clone. São cópias byte a byte do [commit 4bb569c5f22dcdcb3cf05ba47a6839f6367bb157](https://github.com/Heloisa250/Trabalho_BD_Supermercado/tree/4bb569c5f22dcdcb3cf05ba47a6839f6367bb157). O instalador confere todos os SHA-256 e repete a conferência dos arquivos DDL e DML montados no container antes da carga.

O Compose fixa MySQL 8.4.13, porta local configurável, volume nomeado e rede padrão do projeto, separados do legado. O health check verifica o servidor MySQL. A API verifica a conexão e o nome exato do schema. A carga acontece explicitamente pelo comando de provisionamento, após o serviço ficar saudável.

- **Primeira instalação:** iniciar o Compose com volume novo e executar `npm run db:official:init`. O script exige ausência do schema e das contas, importa DDL e DML e confere as 19 contagens. O DML é executado uma vez em transação, com FKs habilitadas. Os perfis gerados ficam em arquivos `.env.*` ignorados.
- **Reinicialização:** usar `docker compose --env-file .env.official -f compose.official.yaml up -d --wait mysql`. O volume conserva a carga e os registros posteriores.
- **Backup e recuperação:** use um dump privado e restaure em um volume novo. Recrie as contas de aplicação com os privilégios do ambiente correspondente. Consulte [restauração](../docs/restauracao.md).
- **Atualização controlada:** revise a versão com a equipe, confirme hashes e prepare outro ambiente. Se a primeira carga falhar, investigue o erro e o catálogo antes de tentar em outro volume. A presença do schema bloqueia uma segunda execução do instalador.

Para reproduzir o ensaio em projeto separado, use um arquivo Compose local com porta livre, inicie com `-p <nome-de-teste>` e passe ao instalador:

```powershell
npm.cmd run db:official:init -- fresh <nome-de-teste> .env.teste backend/.env.teste backend/.env.provision-teste
```

O CLI de senha F0001 verifica a instância padrão da porta 3307 e o UUID salvo. O ensaio em porta alternativa valida a carga e os privilégios, sem converter a senha demonstrativa.
