select 'settings' as item, count(*)::bigint as quantidade from public.investor_financial_settings
union all
select 'custos_produtos', count(*) from public.investor_financial_product_costs
union all
select 'vendas_financeiras', count(*) from public.investor_financial_sale_entries
union all
select 'movimentacoes', count(*) from public.investor_cash_transactions
union all
select 'auditoria', count(*) from public.investor_financial_audit;

select
  allocation_id, investor_id, product_name, gross_amount, discount_amount,
  payment_fee_amount, store_fee_amount, extra_deduction_amount,
  unit_cost, net_received, profit, sale_status
from public.investor_financial_sales_live
order by sold_at desc
limit 20;
