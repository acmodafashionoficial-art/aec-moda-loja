-- Execute este arquivo no SQL Editor do Supabase se a Fase 2 já foi instalada.
alter table public.products add column if not exists weight_kg numeric(8,3) not null default 0.350;
alter table public.products add column if not exists width_cm numeric(8,2) not null default 20;
alter table public.products add column if not exists height_cm numeric(8,2) not null default 5;
alter table public.products add column if not exists length_cm numeric(8,2) not null default 28;

alter table public.orders add column if not exists fulfillment_type text not null default 'delivery';
alter table public.orders add column if not exists shipping_cost numeric(12,2) not null default 0;
alter table public.orders add column if not exists shipping_quote_id text;

create table if not exists public.store_settings (
  id text primary key,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.store_settings enable row level security;

create or replace function public.confirm_paid_order(
  p_order_id uuid,
  p_payment_id text,
  p_status_detail text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_item jsonb;
  v_quantity integer;
  v_variant_id uuid;
begin
  select status into v_status from public.orders where id = p_order_id for update;
  if v_status is null then raise exception 'Pedido não encontrado'; end if;
  if v_status in ('paid', 'approved') then return false; end if;

  for v_item in select * from jsonb_array_elements((select items from public.orders where id = p_order_id))
  loop
    v_quantity := greatest(1, (v_item->>'quantity')::integer);
    select id into v_variant_id
      from public.product_variants
      where product_id = (v_item->>'productId')::uuid
        and size = v_item->>'size'
        and color = v_item->>'color'
      for update;
    if v_variant_id is null then raise exception 'Variação do pedido não encontrada'; end if;
    update public.product_variants
      set stock = stock - v_quantity,
          reserved_stock = greatest(0, reserved_stock - v_quantity)
      where id = v_variant_id and stock >= v_quantity;
    if not found then raise exception 'Estoque insuficiente para confirmar o pedido'; end if;
  end loop;

  update public.orders set
    status = 'paid', payment_id = p_payment_id,
    payment_status_detail = p_status_detail,
    paid_at = now(), updated_at = now()
  where id = p_order_id;
  return true;
end;
$$;
