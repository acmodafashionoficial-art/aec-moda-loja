-- A&C Moda — exclusão segura de produtos
-- Em vez de apagar registros usados pelo estoque/QR/vendas/lotes, o produto é arquivado.
-- Execute uma única vez no SQL Editor do Supabase.

begin;

alter table public.products
  add column if not exists archived_at timestamptz;

create index if not exists products_archived_at_idx
  on public.products(archived_at);

create or replace function public.archive_product(
  p_product_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_archive_slug text;
begin
  select slug
    into v_slug
  from public.products
  where id = p_product_id
    and archived_at is null
  for update;

  if not found then
    return false;
  end if;

  -- Não arquiva enquanto há pedido com estoque reservado.
  if exists (
    select 1
    from public.product_variants
    where product_id = p_product_id
      and greatest(0, reserved_stock) > 0
  ) then
    raise exception 'Este produto possui peça(s) reservada(s) em pedido pendente. Cancele ou aguarde o pedido antes de excluir.';
  end if;

  -- Protege lotes que ainda estão sendo montados ou vendidos.
  if exists (
    select 1
    from public.investment_lot_items li
    join public.investment_lots l on l.id = li.lot_id
    join public.product_variants pv on pv.id = li.variant_id
    where pv.product_id = p_product_id
      and l.status in ('draft', 'active')
  ) then
    raise exception 'Este produto está em um lote de investidores em rascunho ou ativo. Remova a peça do lote ou apague/finalize o lote antes de excluir o produto.';
  end if;

  -- Libera o endereço antigo para um futuro produto com o mesmo nome.
  v_archive_slug :=
    left(v_slug, 180) || '-arquivado-' || replace(substr(p_product_id::text, 1, 8), '-', '');

  update public.products
  set active = false,
      featured = false,
      archived_at = now(),
      slug = v_archive_slug,
      updated_at = now()
  where id = p_product_id;

  -- Mantém as variações para histórico. O trigger atual de estoque transforma
  -- códigos ainda disponíveis em inativos, sem apagar vendas/QR antigos.
  update public.product_variants
  set active = false
  where product_id = p_product_id
    and active = true;

  return true;
end;
$$;

revoke execute on function public.archive_product(uuid)
  from public, anon, authenticated;
grant execute on function public.archive_product(uuid)
  to service_role;

commit;

select
  'EXCLUSÃO SEGURA DE PRODUTOS INSTALADA' as resultado,
  (select count(*) from public.products where archived_at is not null) as produtos_arquivados;
