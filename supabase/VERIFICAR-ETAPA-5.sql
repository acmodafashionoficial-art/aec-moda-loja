-- A&C Moda — verificar Investidores Etapa 5
-- Pode executar depois da migração.

select
  'LOTES' as bloco,
  l.code,
  l.name,
  l.status,
  l.stock_source,
  l.total_units,
  l.archived_at
from public.investment_lots l
order by l.created_at desc
limit 50;

select
  'ESTOQUE LIVRE PARA NOVOS LOTES' as bloco,
  p.name as produto,
  pv.sku,
  pv.size,
  pv.color,
  pv.stock as estoque_produto,
  coalesce(us.available_units, 0) as livre_para_novo_lote
from public.product_variants pv
join public.products p on p.id = pv.product_id
left join public.investment_unassigned_stock us on us.variant_id = pv.id
where pv.active = true
order by p.name, pv.size, pv.color;

select
  'CONFERENCIA ESTOQUE X CODIGOS DISPONIVEIS' as bloco,
  p.name as produto,
  pv.sku,
  pv.stock as estoque_produto,
  count(iu.id) filter (where iu.status = 'available')::integer as codigos_disponiveis,
  count(iu.id) filter (
    where iu.status = 'available' and iu.investment_lot_id is null
  )::integer as livres_para_lote,
  count(iu.id) filter (
    where iu.status = 'available' and iu.investment_lot_id is not null
  )::integer as vinculados_a_lote
from public.product_variants pv
join public.products p on p.id = pv.product_id
left join public.inventory_units iu on iu.variant_id = pv.id
where pv.active = true
group by p.name, pv.id, pv.sku, pv.stock
order by p.name, pv.sku;

select
  case
    when exists (
      select 1
      from public.product_variants pv
      where pv.active = true
        and pv.stock <> (
          select count(*)::integer
          from public.inventory_units iu
          where iu.variant_id = pv.id
            and iu.status = 'available'
        )
    )
    then 'ATENCAO: existe variacao com estoque diferente dos codigos disponiveis'
    else 'ETAPA 5 CONFERIDA: estoque e codigos disponiveis estao alinhados'
  end as resultado;
