use Supermercado;
-- pedi pra ia gerar esses testes pra saber se as inf. estão corretas 
-- 1) Quantidade de linhas por tabela (total deve ser igual ao esperado)
select 'caixa' as tabela, count(*) as total, 5 as esperado from caixa
union all select 'cargo', count(*), 5 from cargo
union all select 'forma_pagamento', count(*), 5 from forma_pagamento
union all select 'marca', count(*), 5 from marca
union all select 'categoria', count(*), 5 from categoria
union all select 'fornecedor', count(*), 5 from fornecedor
union all select 'funcionario', count(*), 5 from funcionario
union all select 'produto', count(*), 5 from produto
union all select 'sessao_caixa', count(*), 3 from sessao_caixa
union all select 'venda', count(*), 5 from venda
union all select 'item_venda', count(*), 10 from item_venda
union all select 'pagamento', count(*), 4 from pagamento
union all select 'nota_fiscal', count(*), 3 from nota_fiscal
union all select 'pedido_compra', count(*), 5 from pedido_compra
union all select 'produto_fornecedor', count(*), 5 from produto_fornecedor
union all select 'item_pedido_compra', count(*), 5 from item_pedido_compra
union all select 'lote', count(*), 5 from lote
union all select 'movimentacao_estoque', count(*), 11 from movimentacao_estoque
union all select 'cancelamento_item', count(*), 2 from cancelamento_item;

-- 2) Funcionários com o cargo (5 linhas, nenhum cargo vazio)
select f.id_funcionario, f.nome, c.nome as cargo, c.pode_cancelar_item
from funcionario f
join cargo c on c.id_cargo = f.id_cargo;

-- 3) Hierarquia de categorias (as 3 principais ficam com categoria_pai vazia)
select c.id_categoria, c.nome as categoria, p.nome as categoria_pai
from categoria c
left join categoria p on p.id_categoria = c.id_categoria_pai;

-- 4) Produtos com categoria e marca (a banana fica com marca vazia)
select p.id_produto, p.nome, c.nome as categoria, m.nome as marca,
       p.unidade_medida, p.preco_venda
from produto p
join categoria c on c.id_categoria = p.id_categoria
left join marca m on m.id_marca = p.id_marca;

-- 5) Total da venda x soma dos itens (a coluna diferenca deve ser 0.00 em todas)
select v.id_venda, v.status, v.valor_total,
       sum(i.subtotal) as soma_itens,
       v.valor_total - sum(i.subtotal) as diferenca
from venda v
join item_venda i on i.id_venda = v.id_venda
group by v.id_venda, v.status, v.valor_total;

-- 6) Total da venda x total pago (finalizadas devem bater; cancelada e aberta ficam com 0)
select v.id_venda, v.status, v.valor_total,
       coalesce(sum(p.valor), 0) as total_pago
from venda v
left join pagamento p on p.id_venda = v.id_venda
group by v.id_venda, v.status, v.valor_total;

-- 7) Estoque do lote x saldo das movimentações (as duas colunas devem ser iguais)
select l.id_lote, l.codigo_lote, l.quantidade_atual,
       sum(case when m.tipo = 'ENTRADA' then m.quantidade else -m.quantidade end) as saldo_movimentacoes
from lote l
join movimentacao_estoque m on m.id_lote = l.id_lote
group by l.id_lote, l.codigo_lote, l.quantidade_atual;

-- 8) Lotes com o item do pedido de compra (o lote EST-INI-FJC aparece com pedido vazio)
select l.id_lote, l.codigo_lote, l.id_pedido, i.quantidade as qtd_pedida
from lote l
left join item_pedido_compra i
  on i.id_pedido = l.id_pedido and i.id_produto = l.id_produto;