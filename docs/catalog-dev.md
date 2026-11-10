# Catálogo e fornecedores

O catálogo usa as rotas protegidas pela lista `ADMIN_MATRICULAS`. No portal, use Categorias, Marcas, Produtos e Fornecedores. Abra os detalhes de um produto para consultar e editar seus vínculos comerciais. O botão Produtos em uma categoria, marca ou fornecedor abre a listagem com o filtro correspondente.

Crie uma categoria e uma subcategoria, depois uma marca, um produto e um fornecedor de demonstração. Em Produtos, cadastre o vínculo e confira preço de custo e prazo. Use os filtros de código de barras e situação, teste duplicidades e confirme que a categoria pai não pode criar um ciclo. Categorias, marcas e vínculos comerciais permanecem cadastrados. Produto e fornecedor têm desativação lógica.

Os preços e limites são strings decimais na API. A interface formata preços em reais. A tela mostra limites de estoque configurados no cadastro. Movimentações, compras, vendas e saldo disponível pertencem a etapas posteriores.

## Contrato oficial R04

O perfil oficial usa o schema `Supermercado` na porta 3307. Categoria e marca usam AUTO_INCREMENT e aceitam nomes repetidos. A hierarquia valida a cadeia de ancestrais em transação e rejeita referência inexistente e ciclos. Produto e fornecedor usam IDs INT explícitos. O alocador compartilhado com R03 usa um lock por tabela na conexão da transação, da leitura do maior ID até o commit ou rollback. Escritores externos precisam respeitar o mesmo lock. A chave primária rejeita colisões.

O produto oficial exige código de barras textual e único, categoria, unidade `UN`, `KG` ou `L`, preço, limites mínimo e máximo e situação explícita. Marca é opcional. Os limites usam DECIMAL(10,3). Preço de venda e custo usam DECIMAL(10,2). Os valores passam como strings decimais. A interface não exibe saldo de estoque, que pertence aos lotes.

O fornecedor oficial exige situação explícita e CNPJ único. O back-end normaliza e valida o CNPJ no cadastro ou quando o campo é enviado em uma edição. A interface omite campos inalterados de um PATCH para que CNPJs demonstrativos importados continuem consultáveis e os demais campos possam ser editados. O vínculo usa a chave composta de produto e fornecedor, custo obrigatório e prazo inteiro de 0 a 32767 dias ou nulo.

O ambiente legado usa AUTO_INCREMENT para produto e fornecedor e admite unidades adicionais e defaults que o DDL oficial não oferece. Para executar o React com o catálogo oficial, use `npm run dev:official -w frontend`. Para empacotar essa configuração, use `npm run build -w frontend -- --mode official`.

## Escrita no oficial após autorização

Confirme a instância na porta 3307 e consulte `SHOW GRANTS FOR 'supermercado_r03_app'@'%';`. Aplique as concessões abaixo somente após autorização explícita.

```sql
GRANT INSERT, UPDATE ON Supermercado.categoria TO 'supermercado_r03_app'@'%';
GRANT INSERT, UPDATE ON Supermercado.marca TO 'supermercado_r03_app'@'%';
GRANT INSERT, UPDATE ON Supermercado.produto TO 'supermercado_r03_app'@'%';
GRANT INSERT, UPDATE ON Supermercado.fornecedor TO 'supermercado_r03_app'@'%';
GRANT INSERT, UPDATE ON Supermercado.produto_fornecedor TO 'supermercado_r03_app'@'%';
SHOW GRANTS FOR 'supermercado_r03_app'@'%';
```

O provisionador inclui as cinco concessões ao criar a conta de aplicação. O R04.1 aplicou as concessões no ambiente oficial existente e verificou escrita e persistência no React e no MySQL com os registros `QA R04.1 1110`. A suíte usa conexões simuladas para verificar o contrato HTTP, as referências inexistentes e a coordenação do alocador.

O R04.2 verificou as respostas da API oficial com a sessão F0001. Pai de categoria, categoria de produto, marca e referências de vínculo inexistentes retornaram HTTP 409. Unidade inválida retornou HTTP 400. A escrita sem sessão retornou HTTP 401. As contagens das cinco tabelas permaneceram em 7 categorias, 6 marcas, 6 produtos, 6 fornecedores e 6 vínculos. As consultas de integridade retornaram zero órfãos.
