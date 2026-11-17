-- Verificação rápida da Etapa 8
select
  i.name as investidor,
  l.source_name,
  l.imported_at,
  (l.summary->>'cash_balance')::numeric as caixa_importado,
  (l.summary->>'historical_inflow')::numeric as entradas_historicas,
  (l.summary->>'historical_outflow')::numeric as saidas_historicas,
  (l.summary->>'pieces_purchased')::integer as pecas_compradas,
  (l.summary->>'pieces_sold')::integer as pecas_vendidas,
  (l.summary->>'pieces_available')::integer as pecas_disponiveis,
  (select count(*) from public.investor_financial_legacy_stock x where x.import_id=l.id) as linhas_estoque,
  (select count(*) from public.investor_financial_legacy_customer_sales x where x.import_id=l.id) as linhas_vendas_clientes,
  (select count(*) from public.investor_financial_legacy_product_sales x where x.import_id=l.id) as linhas_resumo_vendido,
  (select count(*) from public.investor_financial_legacy_expenses x where x.import_id=l.id) as linhas_gastos,
  (select count(*) from public.investor_financial_legacy_stock_positions x where x.import_id=l.id) as linhas_posicao
from public.investor_financial_legacy_imports l
join public.investors i on i.id=l.investor_id
order by l.imported_at desc;
