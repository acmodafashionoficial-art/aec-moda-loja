-- A&C Moda — verificação da Etapa 1 (somente leitura)

select
  to_regclass('public.investors') is not null as investors_ok,
  to_regclass('public.investment_lots') is not null as lots_ok,
  to_regclass('public.investment_distribution_slots') is not null as queue_ok,
  to_regclass('public.investment_sale_allocations') is not null as allocations_ok,
  to_regprocedure('public.activate_investment_lot(uuid,uuid,text)') is not null as activate_rpc_ok,
  to_regprocedure('public.allocate_investment_sale(uuid,text,uuid,numeric,uuid,text)') is not null as allocate_rpc_ok,
  to_regprocedure('public.register_in_store_sale(text,text,uuid,text)') is not null as store_sale_rpc_ok,
  to_regprocedure('public.confirm_paid_order(uuid,text,text)') is not null as online_paid_rpc_ok;

-- Deve retornar zero linhas.
select
  p.name as produto,
  pv.sku,
  pv.size,
  pv.color,
  pv.stock as estoque_fisico,
  count(iu.id) filter (where iu.status = 'available')::integer as codigos_disponiveis
from public.product_variants pv
join public.products p on p.id = pv.product_id
left join public.inventory_units iu on iu.variant_id = pv.id
where pv.active = true
group by p.name, pv.id, pv.sku, pv.size, pv.color, pv.stock
having pv.stock <> count(iu.id) filter (where iu.status = 'available');
