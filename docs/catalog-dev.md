> Documento do ambiente legado. Para o schema oficial, consulte [Banco oficial](banco-oficial.md).

# Catálogo e fornecedores

O catálogo usa as rotas protegidas pela lista `ADMIN_MATRICULAS`. No portal, use Categorias, Marcas, Produtos e Fornecedores. Abra os detalhes de um produto para consultar e editar seus vínculos comerciais. O botão Produtos em uma categoria, marca ou fornecedor abre a listagem com o filtro correspondente.

Crie uma categoria e uma subcategoria, depois uma marca, um produto e um fornecedor de demonstração. Em Produtos, cadastre o vínculo e confira preço de custo e prazo. Use os filtros de código de barras e situação, teste duplicidades e confirme que a categoria pai não pode criar um ciclo. Categorias, marcas e vínculos comerciais permanecem cadastrados. Produto e fornecedor têm desativação lógica.

Os preços e limites são strings decimais na API. A interface formata preços em reais. A tela mostra limites de estoque configurados no cadastro. Movimentações, compras, vendas e saldo disponível pertencem a etapas posteriores.

## Escrita após autorização

Aplique no container isolado e somente após autorização explícita. Confirme o destino com `docker compose ps mysql` e a conta com `SHOW GRANTS FOR 'supermercado_app'@'%';`.

```sql
GRANT INSERT, UPDATE ON supermercado.categoria TO 'supermercado_app'@'%';
GRANT INSERT, UPDATE ON supermercado.marca TO 'supermercado_app'@'%';
GRANT INSERT, UPDATE ON supermercado.produto TO 'supermercado_app'@'%';
GRANT INSERT, UPDATE ON supermercado.fornecedor TO 'supermercado_app'@'%';
GRANT INSERT, UPDATE ON supermercado.produto_fornecedor TO 'supermercado_app'@'%';
SHOW GRANTS FOR 'supermercado_app'@'%';
```
