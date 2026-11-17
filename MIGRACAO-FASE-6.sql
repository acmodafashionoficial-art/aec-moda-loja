-- A&C Moda — Fase 6
-- Supabase: pedidos, reserva de estoque, histórico e acompanhamento.
-- Execute este arquivo inteiro no SQL Editor depois dos schemas das fases anteriores.

create extension if not exists pgcrypto;

alter table public.orders add column if not exists public_code text;
alter table public.orders add column if not exists subtotal numeric(12,2) not null default 0;
alter table public.orders add column if not exists reservation_expires_at timestamptz;
alter table public.orders add column if not exists admin_notes text;

update public.orders
set public_code = 'AEC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
where public_code is null or btrim(public_code) = '';

alter table public.orders alter column public_code set not null;

update public.product_variants
set reserved_stock = least(stock, greatest(0, reserved_stock));

alter table public.product_variants drop constraint if exists product_variants_reserved_not_above_stock;
alter table public.product_variants add constraint product_variants_reserved_not_above_stock
  check (reserved_stock >= 0 and reserved_stock <= stock);

create unique index if not exists orders_public_code_uidx on public.orders(public_code);
create index if not exists orders_status_created_idx on public.orders(status, created_at desc);
create index if not exists orders_customer_email_idx on public.orders(lower(customer_email));
create index if not exists orders_reservation_expiry_idx on public.orders(reservation_expires_at)
  where status in ('pending_payment', 'checkout_error');

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  event_type text not null,
  label text not null,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists order_events_order_created_idx on public.order_events(order_id, created_at desc);
alter table public.order_events enable row level security;

create table if not exists public.order_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  released_at timestamptz,
  unique(order_id, variant_id)
);
create index if not exists order_reservations_order_active_idx on public.order_reservations(order_id, active);
create index if not exists order_reservations_variant_active_idx on public.order_reservations(variant_id, active);
alter table public.order_reservations enable row level security;

-- Não há políticas públicas: o painel e o checkout acessam estas tabelas somente
-- no servidor, usando SUPABASE_SERVICE_ROLE_KEY / chave secreta.

create or replace function public.release_order_reservations(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation record;
  v_count integer := 0;
begin
  for v_reservation in
    select id, variant_id, quantity
    from public.order_reservations
    where order_id = p_order_id and active = true
    for update
  loop
    update public.product_variants
      set reserved_stock = greatest(0, reserved_stock - v_reservation.quantity)
      where id = v_reservation.variant_id;

    update public.order_reservations
      set active = false, released_at = now()
      where id = v_reservation.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.create_pending_order(
  p_order_id uuid,
  p_public_code text,
  p_subtotal numeric,
  p_shipping_cost numeric,
  p_total numeric,
  p_fulfillment_type text,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_customer_document text,
  p_shipping_address jsonb,
  p_shipping_service jsonb,
  p_shipping_quote_id text,
  p_items jsonb,
  p_reservation_expires_at timestamptz
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_variant_id uuid;
  v_quantity integer;
  v_stock integer;
  v_reserved integer;
  v_active boolean;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'O pedido não possui itens';
  end if;

  insert into public.orders (
    id, public_code, status, subtotal, shipping_cost, total, fulfillment_type,
    customer_name, customer_email, customer_phone, customer_document,
    shipping_address, shipping_service, shipping_quote_id, items,
    reservation_expires_at, created_at, updated_at
  ) values (
    p_order_id, upper(btrim(p_public_code)), 'pending_payment', p_subtotal, p_shipping_cost, p_total,
    case when p_fulfillment_type = 'pickup' then 'pickup' else 'delivery' end,
    btrim(p_customer_name), lower(btrim(p_customer_email)), p_customer_phone, p_customer_document,
    coalesce(p_shipping_address, '{}'::jsonb), coalesce(p_shipping_service, '{}'::jsonb),
    p_shipping_quote_id, p_items, p_reservation_expires_at, now(), now()
  );

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    begin
      v_variant_id := nullif(v_item->>'variantId', '')::uuid;
    exception when others then
      raise exception 'Variação inválida no pedido';
    end;
    v_quantity := greatest(1, coalesce((v_item->>'quantity')::integer, 1));
    if v_variant_id is null then raise exception 'Variação ausente no pedido'; end if;

    select pv.stock, pv.reserved_stock, pv.active
      into v_stock, v_reserved, v_active
      from public.product_variants pv
      join public.products p on p.id = pv.product_id
      where pv.id = v_variant_id and p.active = true
      for update of pv;

    if not found or v_active is false then
      raise exception 'Uma variação do pedido não está disponível';
    end if;
    if (v_stock - v_reserved) < v_quantity then
      raise exception 'Estoque insuficiente para uma das variações';
    end if;

    update public.product_variants
      set reserved_stock = reserved_stock + v_quantity
      where id = v_variant_id;

    insert into public.order_reservations(order_id, variant_id, quantity)
      values (p_order_id, v_variant_id, v_quantity);
  end loop;

  insert into public.order_events(order_id, event_type, label, metadata)
    values (p_order_id, 'order_created', 'Pedido criado e aguardando pagamento',
      jsonb_build_object('reservation_expires_at', p_reservation_expires_at));
  return true;
end;
$$;

create or replace function public.release_expired_order_reservations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_count integer := 0;
begin
  for v_order in
    select id
    from public.orders
    where status in ('pending_payment', 'checkout_error')
      and reservation_expires_at is not null
      and reservation_expires_at < now()
    for update skip locked
  loop
    perform public.release_order_reservations(v_order.id);
    update public.orders
      set status = 'expired', updated_at = now()
      where id = v_order.id;
    insert into public.order_events(order_id, event_type, label)
      values (v_order.id, 'reservation_expired', 'Reserva de estoque expirada');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

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
  v_variant_id uuid;
  v_quantity integer;
  v_reservation_quantity integer;
  v_stock integer;
  v_reserved integer;
begin
  select status into v_status from public.orders where id = p_order_id for update;
  if v_status is null then raise exception 'Pedido não encontrado'; end if;
  if v_status in ('paid', 'preparing', 'ready_for_pickup', 'ready_to_ship', 'shipped', 'delivered') then return false; end if;
  if v_status = 'cancelled' then raise exception 'Pedido cancelado não pode ser confirmado'; end if;

  for v_item in select * from jsonb_array_elements((select items from public.orders where id = p_order_id))
  loop
    v_variant_id := nullif(v_item->>'variantId', '')::uuid;
    v_quantity := greatest(1, coalesce((v_item->>'quantity')::integer, 1));

    select stock, reserved_stock into v_stock, v_reserved
      from public.product_variants where id = v_variant_id for update;
    if not found then raise exception 'Variação do pedido não encontrada'; end if;

    select quantity into v_reservation_quantity
      from public.order_reservations
      where order_id = p_order_id and variant_id = v_variant_id and active = true
      for update;

    if found then
      if v_stock < v_quantity then raise exception 'Estoque físico insuficiente para confirmar o pedido'; end if;
      update public.product_variants
        set stock = stock - v_quantity,
            reserved_stock = greatest(0, reserved_stock - v_reservation_quantity)
        where id = v_variant_id;
      update public.order_reservations
        set active = false, released_at = now()
        where order_id = p_order_id and variant_id = v_variant_id and active = true;
    else
      -- Pagamento confirmado depois da expiração: só aprova se ainda houver estoque livre.
      if (v_stock - v_reserved) < v_quantity then
        raise exception 'Estoque livre insuficiente para confirmar pagamento tardio';
      end if;
      update public.product_variants set stock = stock - v_quantity where id = v_variant_id;
    end if;
  end loop;

  update public.orders set
    status = 'paid',
    payment_id = p_payment_id,
    payment_status_detail = p_status_detail,
    paid_at = coalesce(paid_at, now()),
    updated_at = now()
  where id = p_order_id;

  insert into public.order_events(order_id, event_type, label, metadata)
    values (p_order_id, 'payment_approved', 'Pagamento aprovado',
      jsonb_build_object('payment_id', p_payment_id, 'status_detail', p_status_detail));
  return true;
end;
$$;

create or replace function public.record_order_payment_status(
  p_order_id uuid,
  p_status text,
  p_payment_id text,
  p_status_detail text,
  p_label text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('pending_payment', 'payment_failed') then
    raise exception 'Status de pagamento inválido';
  end if;

  if p_status = 'payment_failed' then
    perform public.release_order_reservations(p_order_id);
  end if;

  update public.orders set
    status = p_status,
    payment_id = p_payment_id,
    payment_status_detail = p_status_detail,
    updated_at = now()
  where id = p_order_id and status not in ('paid', 'preparing', 'ready_for_pickup', 'ready_to_ship', 'shipped', 'delivered', 'cancelled');

  if found then
    insert into public.order_events(order_id, event_type, label, metadata)
      values (p_order_id, 'payment_update', p_label,
        jsonb_build_object('payment_id', p_payment_id, 'status_detail', p_status_detail));
  end if;
  return found;
end;
$$;

create or replace function public.cancel_order(p_order_id uuid, p_note text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_item jsonb;
  v_variant_id uuid;
  v_quantity integer;
begin
  select status into v_status from public.orders where id = p_order_id for update;
  if v_status is null then raise exception 'Pedido não encontrado'; end if;
  if v_status in ('shipped', 'delivered') then raise exception 'Pedido enviado ou entregue não pode ser cancelado pelo painel'; end if;
  if v_status = 'cancelled' then return false; end if;

  if v_status in ('paid', 'preparing', 'ready_for_pickup', 'ready_to_ship') then
    -- O pagamento já havia baixado o estoque: devolve as unidades ao cancelar antes do envio.
    for v_item in select * from jsonb_array_elements((select items from public.orders where id = p_order_id))
    loop
      v_variant_id := nullif(v_item->>'variantId', '')::uuid;
      v_quantity := greatest(1, coalesce((v_item->>'quantity')::integer, 1));
      update public.product_variants set stock = stock + v_quantity where id = v_variant_id;
    end loop;
  else
    perform public.release_order_reservations(p_order_id);
  end if;

  update public.orders set status = 'cancelled', admin_notes = coalesce(p_note, admin_notes), updated_at = now()
    where id = p_order_id;
  insert into public.order_events(order_id, event_type, label, note)
    values (p_order_id, 'status_changed', 'Pedido cancelado', p_note);
  return true;
end;
$$;

create or replace function public.update_order_status(
  p_order_id uuid,
  p_status text,
  p_label text,
  p_note text default null,
  p_tracking text default null,
  p_tracking_url text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('pending_payment','paid','preparing','ready_for_pickup','ready_to_ship','shipped','delivered','cancelled','expired','payment_failed','checkout_error') then
    raise exception 'Status inválido';
  end if;
  if p_status = 'cancelled' then
    return public.cancel_order(p_order_id, p_note);
  end if;
  if p_status in ('expired', 'payment_failed', 'checkout_error') then
    perform public.release_order_reservations(p_order_id);
  end if;

  update public.orders set
    status = p_status,
    admin_notes = case when p_note is null or btrim(p_note) = '' then admin_notes else p_note end,
    shipping_tracking = case when p_tracking is null or btrim(p_tracking) = '' then shipping_tracking else p_tracking end,
    shipping_tracking_url = case when p_tracking_url is null or btrim(p_tracking_url) = '' then shipping_tracking_url else p_tracking_url end,
    shipping_status = case when p_status in ('shipped','delivered') then p_status else shipping_status end,
    updated_at = now()
  where id = p_order_id;
  if not found then raise exception 'Pedido não encontrado'; end if;

  insert into public.order_events(order_id, event_type, label, note, metadata)
    values (p_order_id, 'status_changed', p_label, p_note,
      jsonb_strip_nulls(jsonb_build_object('tracking', p_tracking, 'tracking_url', p_tracking_url)));
  return true;
end;
$$;

-- Restringe a execução das funções ao backend com service role.
revoke all on function public.release_order_reservations(uuid) from public, anon, authenticated;
revoke all on function public.create_pending_order(uuid,text,numeric,numeric,numeric,text,text,text,text,text,jsonb,jsonb,text,jsonb,timestamptz) from public, anon, authenticated;
revoke all on function public.release_expired_order_reservations() from public, anon, authenticated;
revoke all on function public.confirm_paid_order(uuid,text,text) from public, anon, authenticated;
revoke all on function public.record_order_payment_status(uuid,text,text,text,text) from public, anon, authenticated;
revoke all on function public.cancel_order(uuid,text) from public, anon, authenticated;
revoke all on function public.update_order_status(uuid,text,text,text,text,text) from public, anon, authenticated;

grant execute on function public.release_order_reservations(uuid) to service_role;
grant execute on function public.create_pending_order(uuid,text,numeric,numeric,numeric,text,text,text,text,text,jsonb,jsonb,text,jsonb,timestamptz) to service_role;
grant execute on function public.release_expired_order_reservations() to service_role;
grant execute on function public.confirm_paid_order(uuid,text,text) to service_role;
grant execute on function public.record_order_payment_status(uuid,text,text,text,text) to service_role;
grant execute on function public.cancel_order(uuid,text) to service_role;
grant execute on function public.update_order_status(uuid,text,text,text,text,text) to service_role;
