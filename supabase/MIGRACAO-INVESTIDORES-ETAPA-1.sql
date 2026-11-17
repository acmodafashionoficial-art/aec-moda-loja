-- A&C Moda — Investidores / Rodízio — Etapa 1
-- Núcleo seguro: investidores, lotes, sorteio único, fila materializada,
-- distribuição automática nas vendas presenciais e online, estornos e auditoria.
--
-- Execute este arquivo inteiro no SQL Editor do Supabase.
-- Esta etapa não cria telas ainda.
-- Sem lote ativo, o fluxo atual da loja continua funcionando.

begin;

create extension if not exists pgcrypto;

-- 1. INVESTIDORES
create table if not exists public.investors (
  id uuid primary key default gen_random_uuid(),
  code text unique not null
    default ('INV-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  email text,
  phone text,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists investors_email_unique_idx
  on public.investors(lower(email))
  where email is not null and btrim(email) <> '';

create index if not exists investors_active_name_idx
  on public.investors(active, name);

-- 2. LOTES COMPARTILHADOS
create table if not exists public.investment_lots (
  id uuid primary key default gen_random_uuid(),
  code text unique not null
    default ('LOT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  name text not null check (char_length(btrim(name)) between 2 and 160),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'completed', 'cancelled')),
  distribution_rule text not null default 'round_robin_random'
    check (distribution_rule = 'round_robin_random'),
  total_units integer not null default 0 check (total_units >= 0),
  created_by_user_id uuid,
  created_by_email text,
  draw_locked_at timestamptz,
  activated_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists investment_lots_status_created_idx
  on public.investment_lots(status, created_at desc);

create table if not exists public.investment_lot_participants (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.investment_lots(id) on delete cascade,
  investor_id uuid not null references public.investors(id) on delete restrict,
  purchased_units integer not null check (purchased_units > 0 and purchased_units <= 10000),
  draw_position integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lot_id, investor_id),
  unique (lot_id, draw_position)
);

create index if not exists investment_lot_participants_lot_idx
  on public.investment_lot_participants(lot_id);

-- Rascunho das peças do lote. Nada entra no estoque até a ativação.
create table if not exists public.investment_lot_items (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.investment_lots(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  quantity integer not null check (quantity > 0 and quantity <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lot_id, variant_id)
);

create index if not exists investment_lot_items_lot_idx
  on public.investment_lot_items(lot_id);

-- A fila inteira é gravada antes da primeira venda.
create table if not exists public.investment_distribution_slots (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.investment_lots(id) on delete cascade,
  slot_number integer not null check (slot_number > 0),
  investor_id uuid not null references public.investors(id) on delete restrict,
  draw_position integer not null check (draw_position > 0),
  status text not null default 'pending'
    check (status in ('pending', 'allocated', 'reversed')),
  replacement_for_slot_id uuid
    references public.investment_distribution_slots(id) on delete restrict,
  allocated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (lot_id, slot_number),
  unique (replacement_for_slot_id)
);

create index if not exists investment_distribution_slots_next_idx
  on public.investment_distribution_slots(lot_id, status, slot_number);

create index if not exists investment_distribution_slots_investor_idx
  on public.investment_distribution_slots(investor_id, lot_id, slot_number);

-- 3. PEÇAS FÍSICAS VINCULADAS A LOTE
alter table public.inventory_units
  add column if not exists investment_lot_id uuid
    references public.investment_lots(id) on delete restrict;

create index if not exists inventory_units_investment_lot_status_idx
  on public.inventory_units(investment_lot_id, status)
  where investment_lot_id is not null;

-- 4. DISTRIBUIÇÕES EFETIVAS
create table if not exists public.investment_sale_allocations (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.investment_lots(id) on delete restrict,
  slot_id uuid not null unique
    references public.investment_distribution_slots(id) on delete restrict,
  investor_id uuid not null references public.investors(id) on delete restrict,
  inventory_unit_id uuid not null references public.inventory_units(id) on delete restrict,
  source_type text not null check (source_type in ('store_sale', 'online_order')),
  in_store_sale_id uuid references public.in_store_sales(id) on delete restrict,
  online_order_id uuid references public.orders(id) on delete restrict,
  gross_amount numeric(12,2) not null check (gross_amount >= 0),
  status text not null default 'active' check (status in ('active', 'reversed')),
  reversed_at timestamptz,
  reversal_reason text,
  created_at timestamptz not null default now(),
  check (
    (source_type = 'store_sale' and in_store_sale_id is not null and online_order_id is null)
    or
    (source_type = 'online_order' and online_order_id is not null and in_store_sale_id is null)
  )
);

create unique index if not exists investment_sale_allocations_active_unit_idx
  on public.investment_sale_allocations(inventory_unit_id)
  where status = 'active';

create index if not exists investment_sale_allocations_lot_created_idx
  on public.investment_sale_allocations(lot_id, created_at desc);

create index if not exists investment_sale_allocations_investor_created_idx
  on public.investment_sale_allocations(investor_id, created_at desc);

create index if not exists investment_sale_allocations_store_sale_idx
  on public.investment_sale_allocations(in_store_sale_id)
  where in_store_sale_id is not null;

create index if not exists investment_sale_allocations_online_order_idx
  on public.investment_sale_allocations(online_order_id)
  where online_order_id is not null;

create table if not exists public.investment_events (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid references public.investment_lots(id) on delete restrict,
  investor_id uuid references public.investors(id) on delete restrict,
  event_type text not null,
  label text not null,
  metadata jsonb not null default '{}'::jsonb,
  actor_user_id uuid,
  actor_email text,
  created_at timestamptz not null default now()
);

create index if not exists investment_events_lot_created_idx
  on public.investment_events(lot_id, created_at desc);

create index if not exists investment_events_investor_created_idx
  on public.investment_events(investor_id, created_at desc);

-- 5. UPDATED_AT
create or replace function public.set_investment_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists investors_set_updated_at on public.investors;
create trigger investors_set_updated_at
before update on public.investors
for each row execute function public.set_investment_updated_at();

drop trigger if exists investment_lots_set_updated_at on public.investment_lots;
create trigger investment_lots_set_updated_at
before update on public.investment_lots
for each row execute function public.set_investment_updated_at();

drop trigger if exists investment_lot_participants_set_updated_at
  on public.investment_lot_participants;
create trigger investment_lot_participants_set_updated_at
before update on public.investment_lot_participants
for each row execute function public.set_investment_updated_at();

drop trigger if exists investment_lot_items_set_updated_at
  on public.investment_lot_items;
create trigger investment_lot_items_set_updated_at
before update on public.investment_lot_items
for each row execute function public.set_investment_updated_at();

-- 6. EDITAR PARTICIPANTES/PEÇAS SOMENTE EM RASCUNHO
create or replace function public.set_investment_lot_participant(
  p_lot_id uuid,
  p_investor_id uuid,
  p_units integer,
  p_actor_user_id uuid default null,
  p_actor_email text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status
  from public.investment_lots
  where id = p_lot_id
  for update;

  if not found then raise exception 'Lote não encontrado'; end if;
  if v_status <> 'draft' then
    raise exception 'Os investidores só podem ser alterados enquanto o lote estiver em rascunho';
  end if;

  if not exists (
    select 1 from public.investors
    where id = p_investor_id and active = true
  ) then
    raise exception 'Investidor não encontrado ou inativo';
  end if;

  if p_units is null or p_units < 0 or p_units > 10000 then
    raise exception 'Quantidade inválida para o investidor';
  end if;

  if p_units = 0 then
    delete from public.investment_lot_participants
    where lot_id = p_lot_id and investor_id = p_investor_id;
  else
    insert into public.investment_lot_participants(
      lot_id, investor_id, purchased_units, draw_position
    )
    values (p_lot_id, p_investor_id, p_units, null)
    on conflict (lot_id, investor_id)
    do update set
      purchased_units = excluded.purchased_units,
      draw_position = null;
  end if;

  insert into public.investment_events(
    lot_id, investor_id, event_type, label, metadata, actor_user_id, actor_email
  )
  values (
    p_lot_id, p_investor_id, 'participant_changed',
    'Participação do investidor atualizada',
    jsonb_build_object('units', p_units),
    p_actor_user_id, nullif(btrim(p_actor_email), '')
  );

  return true;
end;
$$;

create or replace function public.set_investment_lot_item(
  p_lot_id uuid,
  p_variant_id uuid,
  p_quantity integer,
  p_actor_user_id uuid default null,
  p_actor_email text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status
  from public.investment_lots
  where id = p_lot_id
  for update;

  if not found then raise exception 'Lote não encontrado'; end if;
  if v_status <> 'draft' then
    raise exception 'As peças só podem ser alteradas enquanto o lote estiver em rascunho';
  end if;

  if not exists (
    select 1
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.id = p_variant_id
      and pv.active = true
      and p.active = true
  ) then
    raise exception 'Produto ou variação não encontrada/inativa';
  end if;

  if p_quantity is null or p_quantity < 0 or p_quantity > 10000 then
    raise exception 'Quantidade inválida para a peça';
  end if;

  if p_quantity = 0 then
    delete from public.investment_lot_items
    where lot_id = p_lot_id and variant_id = p_variant_id;
  else
    insert into public.investment_lot_items(lot_id, variant_id, quantity)
    values (p_lot_id, p_variant_id, p_quantity)
    on conflict (lot_id, variant_id)
    do update set quantity = excluded.quantity;
  end if;

  insert into public.investment_events(
    lot_id, event_type, label, metadata, actor_user_id, actor_email
  )
  values (
    p_lot_id, 'lot_item_changed', 'Quantidade de peças do lote atualizada',
    jsonb_build_object('variant_id', p_variant_id, 'quantity', p_quantity),
    p_actor_user_id, nullif(btrim(p_actor_email), '')
  );

  return true;
end;
$$;

-- 7. ATIVAÇÃO: SORTEIO ÚNICO + FILA COMPLETA + ENTRADA NO ESTOQUE
create or replace function public.activate_investment_lot(
  p_lot_id uuid,
  p_actor_user_id uuid default null,
  p_actor_email text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot public.investment_lots;
  v_participant_units integer;
  v_item_units integer;
  v_max_round integer;
  v_round integer;
  v_slot_number integer := 0;
  v_participant record;
  v_item record;
begin
  select * into v_lot
  from public.investment_lots
  where id = p_lot_id
  for update;

  if not found then raise exception 'Lote não encontrado'; end if;
  if v_lot.status <> 'draft' then
    raise exception 'Somente lotes em rascunho podem ser ativados';
  end if;

  if exists (
    select 1 from public.investment_distribution_slots
    where lot_id = p_lot_id
  ) then
    raise exception 'Este lote já possui uma ordem gravada e não pode ser sorteado novamente';
  end if;

  select coalesce(sum(purchased_units), 0)
  into v_participant_units
  from public.investment_lot_participants
  where lot_id = p_lot_id;

  select coalesce(sum(quantity), 0)
  into v_item_units
  from public.investment_lot_items
  where lot_id = p_lot_id;

  if v_participant_units <= 0 then
    raise exception 'Adicione pelo menos um investidor ao lote';
  end if;
  if v_item_units <= 0 then
    raise exception 'Adicione pelo menos uma peça ao lote';
  end if;
  if v_participant_units <> v_item_units then
    raise exception
      'A soma das participações deve ser igual ao total de peças: investidores %, peças %',
      v_participant_units, v_item_units;
  end if;

  -- Confere de novo se todos os produtos ainda estão ativos.
  if exists (
    select 1
    from public.investment_lot_items li
    left join public.product_variants pv on pv.id = li.variant_id
    left join public.products p on p.id = pv.product_id
    where li.lot_id = p_lot_id
      and (pv.id is null or pv.active is false or p.id is null or p.active is false)
  ) then
    raise exception 'Um produto ou variação do lote deixou de estar ativo';
  end if;

  -- Sorteia a ordem base UMA VEZ.
  with randomized as (
    select
      id,
      row_number() over (order by gen_random_uuid())::integer as draw_position
    from public.investment_lot_participants
    where lot_id = p_lot_id
  )
  update public.investment_lot_participants p
  set draw_position = r.draw_position
  from randomized r
  where p.id = r.id;

  select max(purchased_units)
  into v_max_round
  from public.investment_lot_participants
  where lot_id = p_lot_id;

  -- Rodízio por rodadas; quem zera sua quantidade deixa de aparecer.
  for v_round in 1..v_max_round loop
    for v_participant in
      select investor_id, draw_position, purchased_units
      from public.investment_lot_participants
      where lot_id = p_lot_id
        and purchased_units >= v_round
      order by draw_position
    loop
      v_slot_number := v_slot_number + 1;

      insert into public.investment_distribution_slots(
        lot_id, slot_number, investor_id, draw_position, status
      )
      values (
        p_lot_id, v_slot_number, v_participant.investor_id,
        v_participant.draw_position, 'pending'
      );
    end loop;
  end loop;

  if v_slot_number <> v_participant_units then
    raise exception 'Falha de segurança ao gerar a sequência do rodízio';
  end if;

  -- Só agora as peças entram no estoque real.
  for v_item in
    select variant_id, quantity
    from public.investment_lot_items
    where lot_id = p_lot_id
    order by created_at, id
  loop
    update public.product_variants
    set stock = stock + v_item.quantity
    where id = v_item.variant_id
      and active = true;

    if not found then
      raise exception 'Uma variação do lote deixou de estar ativa';
    end if;

    with created_units as (
      insert into public.inventory_units(variant_id, investment_lot_id)
      select v_item.variant_id, p_lot_id
      from generate_series(1, v_item.quantity)
      returning id
    )
    insert into public.inventory_unit_events(
      inventory_unit_id, event_type, label, metadata, actor_user_id, actor_email
    )
    select
      cu.id,
      'investment_lot_created',
      'Peça adicionada por lote de investidores',
      jsonb_build_object('lot_id', p_lot_id),
      p_actor_user_id,
      nullif(btrim(p_actor_email), '')
    from created_units cu;
  end loop;

  update public.investment_lots
  set
    status = 'active',
    total_units = v_participant_units,
    draw_locked_at = now(),
    activated_at = now(),
    completed_at = null
  where id = p_lot_id;

  insert into public.investment_events(
    lot_id, event_type, label, metadata, actor_user_id, actor_email
  )
  values (
    p_lot_id, 'lot_activated',
    'Lote ativado, ordem sorteada e rodízio travado',
    jsonb_build_object('total_units', v_participant_units, 'total_slots', v_slot_number),
    p_actor_user_id, nullif(btrim(p_actor_email), '')
  );

  return true;
end;
$$;

create or replace function public.cancel_draft_investment_lot(
  p_lot_id uuid,
  p_reason text default null,
  p_actor_user_id uuid default null,
  p_actor_email text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status
  from public.investment_lots
  where id = p_lot_id
  for update;

  if not found then raise exception 'Lote não encontrado'; end if;
  if v_status = 'cancelled' then return false; end if;
  if v_status <> 'draft' then
    raise exception 'Depois de ativado, o lote não pode ser cancelado por esta operação';
  end if;

  update public.investment_lots
  set
    status = 'cancelled',
    cancelled_at = now(),
    cancellation_reason = nullif(btrim(p_reason), '')
  where id = p_lot_id;

  insert into public.investment_events(
    lot_id, event_type, label, metadata, actor_user_id, actor_email
  )
  values (
    p_lot_id, 'lot_cancelled', 'Lote em rascunho cancelado',
    jsonb_build_object('reason', nullif(btrim(p_reason), '')),
    p_actor_user_id, nullif(btrim(p_actor_email), '')
  );

  return true;
end;
$$;

-- 8. MOTOR DO RODÍZIO
create or replace function public.allocate_investment_sale(
  p_inventory_unit_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_gross_amount numeric,
  p_actor_user_id uuid default null,
  p_actor_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot_id uuid;
  v_lot_status text;
  v_slot public.investment_distribution_slots;
  v_allocation_id uuid;
begin
  if p_source_type not in ('store_sale', 'online_order') then
    raise exception 'Origem de venda inválida';
  end if;
  if p_source_id is null then
    raise exception 'Origem da venda não informada';
  end if;
  if p_gross_amount is null or p_gross_amount < 0 then
    raise exception 'Valor da venda inválido';
  end if;

  select investment_lot_id into v_lot_id
  from public.inventory_units
  where id = p_inventory_unit_id
  for update;

  if not found then raise exception 'Peça física não encontrada'; end if;

  -- Estoque legado/sem investidor não entra no rodízio.
  if v_lot_id is null then return null; end if;

  -- Bloqueio do lote: vendas simultâneas não conseguem inverter a fila.
  select status into v_lot_status
  from public.investment_lots
  where id = v_lot_id
  for update;

  if not found then raise exception 'Lote vinculado à peça não encontrado'; end if;
  if v_lot_status <> 'active' then
    raise exception 'O lote desta peça não está ativo para distribuição';
  end if;

  if exists (
    select 1 from public.investment_sale_allocations
    where inventory_unit_id = p_inventory_unit_id
      and status = 'active'
  ) then
    raise exception 'Esta peça já possui uma distribuição ativa';
  end if;

  select * into v_slot
  from public.investment_distribution_slots
  where lot_id = v_lot_id
    and status = 'pending'
  order by slot_number
  limit 1
  for update;

  if not found then
    raise exception 'O lote não possui uma próxima posição disponível';
  end if;

  insert into public.investment_sale_allocations(
    lot_id, slot_id, investor_id, inventory_unit_id,
    source_type, in_store_sale_id, online_order_id, gross_amount, status
  )
  values (
    v_lot_id,
    v_slot.id,
    v_slot.investor_id,
    p_inventory_unit_id,
    p_source_type,
    case when p_source_type = 'store_sale' then p_source_id else null end,
    case when p_source_type = 'online_order' then p_source_id else null end,
    round(p_gross_amount, 2),
    'active'
  )
  returning id into v_allocation_id;

  update public.investment_distribution_slots
  set status = 'allocated', allocated_at = now()
  where id = v_slot.id;

  insert into public.investment_events(
    lot_id, investor_id, event_type, label, metadata, actor_user_id, actor_email
  )
  values (
    v_lot_id,
    v_slot.investor_id,
    'sale_allocated',
    'Venda distribuída pelo rodízio',
    jsonb_build_object(
      'allocation_id', v_allocation_id,
      'slot_id', v_slot.id,
      'slot_number', v_slot.slot_number,
      'inventory_unit_id', p_inventory_unit_id,
      'source_type', p_source_type,
      'source_id', p_source_id,
      'gross_amount', round(p_gross_amount, 2)
    ),
    p_actor_user_id,
    nullif(btrim(p_actor_email), '')
  );

  if not exists (
    select 1 from public.investment_distribution_slots
    where lot_id = v_lot_id and status = 'pending'
  ) then
    update public.investment_lots
    set status = 'completed', completed_at = now()
    where id = v_lot_id;
  end if;

  return v_allocation_id;
end;
$$;

create or replace function public.reverse_investment_allocation_for_unit(
  p_inventory_unit_id uuid,
  p_reason text default null,
  p_actor_user_id uuid default null,
  p_actor_email text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allocation public.investment_sale_allocations;
  v_slot public.investment_distribution_slots;
  v_next_slot_number integer;
begin
  select * into v_allocation
  from public.investment_sale_allocations
  where inventory_unit_id = p_inventory_unit_id
    and status = 'active'
  order by created_at desc
  limit 1
  for update;

  if not found then return false; end if;

  perform 1
  from public.investment_lots
  where id = v_allocation.lot_id
  for update;

  select * into v_slot
  from public.investment_distribution_slots
  where id = v_allocation.slot_id
  for update;

  update public.investment_sale_allocations
  set
    status = 'reversed',
    reversed_at = now(),
    reversal_reason = nullif(btrim(p_reason), '')
  where id = v_allocation.id;

  update public.investment_distribution_slots
  set status = 'reversed'
  where id = v_slot.id;

  -- A participação volta ao fim da fila, sem apagar o histórico.
  select coalesce(max(slot_number), 0) + 1
  into v_next_slot_number
  from public.investment_distribution_slots
  where lot_id = v_allocation.lot_id;

  insert into public.investment_distribution_slots(
    lot_id, slot_number, investor_id, draw_position,
    status, replacement_for_slot_id
  )
  values (
    v_allocation.lot_id,
    v_next_slot_number,
    v_allocation.investor_id,
    v_slot.draw_position,
    'pending',
    v_slot.id
  );

  update public.investment_lots
  set status = 'active', completed_at = null
  where id = v_allocation.lot_id
    and status = 'completed';

  insert into public.investment_events(
    lot_id, investor_id, event_type, label, metadata, actor_user_id, actor_email
  )
  values (
    v_allocation.lot_id,
    v_allocation.investor_id,
    'sale_reversed',
    'Venda estornada e participação devolvida ao rodízio',
    jsonb_build_object(
      'allocation_id', v_allocation.id,
      'original_slot_number', v_slot.slot_number,
      'replacement_slot_number', v_next_slot_number,
      'inventory_unit_id', p_inventory_unit_id,
      'reason', nullif(btrim(p_reason), '')
    ),
    p_actor_user_id,
    nullif(btrim(p_actor_email), '')
  );

  return true;
end;
$$;

-- 9. SINCRONIZAÇÃO DE ESTOQUE PROTEGIDA
create or replace function public.sync_inventory_units_for_variant(
  p_variant_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_stock integer;
  v_available_count integer;
  v_difference integer;
  v_needed integer;
  v_unit record;
begin
  select greatest(0, stock)
  into v_target_stock
  from public.product_variants
  where id = p_variant_id
  for update;

  if not found then raise exception 'Variação não encontrada'; end if;

  select count(*) into v_available_count
  from public.inventory_units
  where variant_id = p_variant_id
    and status = 'available';

  v_difference := v_target_stock - v_available_count;

  if v_difference > 0 then
    perform public.create_inventory_units(p_variant_id, v_difference);

  elsif v_difference < 0 then
    v_needed := abs(v_difference);

    for v_unit in
      select id
      from public.inventory_units
      where variant_id = p_variant_id
        and status = 'available'
        and investment_lot_id is null
      order by created_at desc
      limit v_needed
      for update skip locked
    loop
      update public.inventory_units
      set status = 'inactive'
      where id = v_unit.id;

      insert into public.inventory_unit_events(
        inventory_unit_id, event_type, label
      )
      values (
        v_unit.id, 'deactivated',
        'Código desativado após redução do estoque'
      );

      v_needed := v_needed - 1;
    end loop;

    if v_needed > 0 then
      raise exception
        'A redução de estoque atingiria % peça(s) vinculada(s) a lote de investidores. Ajuste pelo módulo Investidores.',
        v_needed;
    end if;
  end if;

  return v_difference;
end;
$$;

-- Reconcilia o estoque legado atual antes dos novos lotes.
do $$
declare
  v_variant record;
begin
  for v_variant in
    select id from public.product_variants
    where active = true
  loop
    perform public.sync_inventory_units_for_variant(v_variant.id);
  end loop;
end;
$$;

-- 10. VENDA PRESENCIAL: MESMA ASSINATURA, AGORA COM RODÍZIO
create or replace function public.register_in_store_sale(
  p_unit_code text,
  p_payment_method text,
  p_actor_user_id uuid default null,
  p_actor_email text default null
)
returns table (
  sale_id uuid,
  sale_public_code text,
  unit_code text,
  product_name text,
  sku text,
  size text,
  color text,
  unit_price numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit record;
  v_sale public.in_store_sales;
begin
  if p_payment_method not in ('pix', 'dinheiro', 'debito', 'credito', 'outro') then
    raise exception 'Forma de pagamento inválida';
  end if;

  select
    iu.id as unit_id,
    iu.code,
    iu.status,
    iu.investment_lot_id,
    pv.id as variant_id,
    pv.sku,
    pv.size,
    pv.color,
    pv.stock,
    pv.reserved_stock,
    pv.active as variant_active,
    p.id as product_id,
    p.name,
    p.price,
    p.active as product_active
  into v_unit
  from public.inventory_units iu
  join public.product_variants pv on pv.id = iu.variant_id
  join public.products p on p.id = pv.product_id
  where upper(iu.code) = upper(btrim(p_unit_code))
  for update of iu, pv;

  if not found then raise exception 'Código não encontrado'; end if;
  if v_unit.status <> 'available' then
    raise exception 'Esta peça não está disponível';
  end if;
  if v_unit.variant_active is false or v_unit.product_active is false then
    raise exception 'Produto ou variação inativa';
  end if;
  if (v_unit.stock - coalesce(v_unit.reserved_stock, 0)) < 1 then
    raise exception 'Esta variação não possui estoque livre';
  end if;

  insert into public.in_store_sales(
    payment_method, total, sold_by_user_id, sold_by_email
  )
  values (
    p_payment_method, v_unit.price, p_actor_user_id,
    nullif(btrim(p_actor_email), '')
  )
  returning * into v_sale;

  insert into public.in_store_sale_items(
    sale_id, inventory_unit_id, product_id, variant_id,
    product_name, sku, size, color, unit_price
  )
  values (
    v_sale.id, v_unit.unit_id, v_unit.product_id, v_unit.variant_id,
    v_unit.name, v_unit.sku, v_unit.size, v_unit.color, v_unit.price
  );

  update public.inventory_units
  set status = 'sold_store',
      in_store_sale_id = v_sale.id,
      sold_at = now()
  where id = v_unit.unit_id;

  update public.product_variants
  set stock = stock - 1
  where id = v_unit.variant_id;

  insert into public.inventory_unit_events(
    inventory_unit_id, event_type, label, metadata, actor_user_id, actor_email
  )
  values (
    v_unit.unit_id,
    'sold_store',
    'Venda presencial registrada',
    jsonb_build_object(
      'sale_id', v_sale.id,
      'sale_public_code', v_sale.public_code,
      'payment_method', p_payment_method,
      'price', v_unit.price
    ),
    p_actor_user_id,
    nullif(btrim(p_actor_email), '')
  );

  perform public.allocate_investment_sale(
    v_unit.unit_id, 'store_sale', v_sale.id, v_unit.price,
    p_actor_user_id, p_actor_email
  );

  return query
  select
    v_sale.id, v_sale.public_code, v_unit.code, v_unit.name,
    v_unit.sku, v_unit.size, v_unit.color, v_unit.price;
end;
$$;

-- 11. CANCELAMENTO PRESENCIAL: DEVOLVE PEÇA E PARTICIPAÇÃO
create or replace function public.cancel_in_store_sale(
  p_sale_id uuid,
  p_reason text default null,
  p_actor_user_id uuid default null,
  p_actor_email text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.in_store_sales;
  v_item record;
begin
  select * into v_sale
  from public.in_store_sales
  where id = p_sale_id
  for update;

  if not found then raise exception 'Venda não encontrada'; end if;
  if v_sale.status = 'cancelled' then return false; end if;

  for v_item in
    select isi.inventory_unit_id, isi.variant_id
    from public.in_store_sale_items isi
    where isi.sale_id = p_sale_id
    for update
  loop
    perform public.reverse_investment_allocation_for_unit(
      v_item.inventory_unit_id,
      coalesce(nullif(btrim(p_reason), ''), 'Venda presencial cancelada'),
      p_actor_user_id,
      p_actor_email
    );

    update public.inventory_units
    set status = 'available',
        in_store_sale_id = null,
        sold_at = null
    where id = v_item.inventory_unit_id
      and status = 'sold_store'
      and in_store_sale_id = p_sale_id;

    if found then
      update public.product_variants
      set stock = stock + 1
      where id = v_item.variant_id;

      insert into public.inventory_unit_events(
        inventory_unit_id, event_type, label, metadata,
        actor_user_id, actor_email
      )
      values (
        v_item.inventory_unit_id,
        'sale_cancelled',
        'Venda presencial cancelada e peça devolvida ao estoque',
        jsonb_build_object(
          'sale_id', p_sale_id,
          'reason', nullif(btrim(p_reason), '')
        ),
        p_actor_user_id,
        nullif(btrim(p_actor_email), '')
      );
    end if;
  end loop;

  update public.in_store_sales
  set status = 'cancelled',
      cancelled_at = now(),
      cancellation_reason = nullif(btrim(p_reason), ''),
      cancelled_by_user_id = p_actor_user_id,
      cancelled_by_email = nullif(btrim(p_actor_email), '')
  where id = p_sale_id;

  return true;
end;
$$;

-- 12. PAGAMENTO ONLINE: BAIXA UNIDADE FÍSICA E DISTRIBUI
create or replace function public.confirm_paid_order(
  p_order_id uuid,
  p_payment_id text,
  p_status_detail text
)
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
  v_reservation_quantity integer;
  v_stock integer;
  v_reserved integer;
  v_unit record;
  v_index integer;
  v_unit_price numeric;
begin
  select status into v_status
  from public.orders
  where id = p_order_id
  for update;

  if v_status is null then raise exception 'Pedido não encontrado'; end if;
  if v_status in ('paid', 'preparing', 'ready_for_pickup', 'ready_to_ship', 'shipped', 'delivered') then
    return false;
  end if;
  if v_status = 'cancelled' then
    raise exception 'Pedido cancelado não pode ser confirmado';
  end if;

  for v_item in
    select * from jsonb_array_elements(
      (select items from public.orders where id = p_order_id)
    )
  loop
    v_variant_id := nullif(v_item->>'variantId', '')::uuid;
    v_quantity := greatest(1, coalesce((v_item->>'quantity')::integer, 1));
    v_unit_price := greatest(
      0,
      coalesce(
        nullif(v_item->>'unitPrice', '')::numeric,
        nullif(v_item->>'lineTotal', '')::numeric / v_quantity,
        0
      )
    );

    select stock, reserved_stock
    into v_stock, v_reserved
    from public.product_variants
    where id = v_variant_id
    for update;

    if not found then raise exception 'Variação do pedido não encontrada'; end if;

    select quantity into v_reservation_quantity
    from public.order_reservations
    where order_id = p_order_id
      and variant_id = v_variant_id
      and active = true
    for update;

    if found then
      if v_stock < v_quantity then
        raise exception 'Estoque físico insuficiente para confirmar o pedido';
      end if;

      update public.product_variants
      set stock = stock - v_quantity,
          reserved_stock = greatest(0, reserved_stock - v_reservation_quantity)
      where id = v_variant_id;

      update public.order_reservations
      set active = false, released_at = now()
      where order_id = p_order_id
        and variant_id = v_variant_id
        and active = true;
    else
      if (v_stock - v_reserved) < v_quantity then
        raise exception 'Estoque livre insuficiente para confirmar pagamento tardio';
      end if;

      update public.product_variants
      set stock = stock - v_quantity
      where id = v_variant_id;
    end if;

    for v_index in 1..v_quantity loop
      select iu.id, iu.investment_lot_id
      into v_unit
      from public.inventory_units iu
      left join public.investment_lots il
        on il.id = iu.investment_lot_id
      where iu.variant_id = v_variant_id
        and iu.status = 'available'
        and (
          iu.investment_lot_id is null
          or il.status = 'active'
        )
      order by
        case
          when iu.investment_lot_id is not null then 0
          else 1
        end,
        il.activated_at nulls last,
        iu.created_at,
        iu.id
      limit 1
      for update of iu skip locked;

      if not found then
        raise exception 'Peça física individual não encontrada para confirmar o pedido';
      end if;

      update public.inventory_units
      set status = 'sold_online',
          online_order_id = p_order_id,
          sold_at = now()
      where id = v_unit.id;

      insert into public.inventory_unit_events(
        inventory_unit_id, event_type, label, metadata
      )
      values (
        v_unit.id,
        'sold_online',
        'Venda online confirmada',
        jsonb_build_object(
          'order_id', p_order_id,
          'payment_id', p_payment_id,
          'unit_price', round(v_unit_price, 2)
        )
      );

      perform public.allocate_investment_sale(
        v_unit.id, 'online_order', p_order_id, v_unit_price, null, null
      );
    end loop;
  end loop;

  update public.orders
  set status = 'paid',
      payment_id = p_payment_id,
      payment_status_detail = p_status_detail,
      paid_at = coalesce(paid_at, now()),
      updated_at = now()
  where id = p_order_id;

  insert into public.order_events(
    order_id, event_type, label, metadata
  )
  values (
    p_order_id,
    'payment_approved',
    'Pagamento aprovado',
    jsonb_build_object(
      'payment_id', p_payment_id,
      'status_detail', p_status_detail
    )
  );

  return true;
end;
$$;

-- 13. CANCELAMENTO ONLINE: DEVOLVE PEÇAS E PARTICIPAÇÕES
create or replace function public.cancel_order(
  p_order_id uuid,
  p_note text default null
)
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
  v_unit record;
begin
  select status into v_status
  from public.orders
  where id = p_order_id
  for update;

  if v_status is null then raise exception 'Pedido não encontrado'; end if;
  if v_status in ('shipped', 'delivered') then
    raise exception 'Pedido enviado ou entregue não pode ser cancelado pelo painel';
  end if;
  if v_status = 'cancelled' then return false; end if;

  if v_status in ('paid', 'preparing', 'ready_for_pickup', 'ready_to_ship') then
    for v_unit in
      select id
      from public.inventory_units
      where online_order_id = p_order_id
        and status = 'sold_online'
      order by sold_at, id
      for update
    loop
      perform public.reverse_investment_allocation_for_unit(
        v_unit.id,
        coalesce(nullif(btrim(p_note), ''), 'Pedido online cancelado'),
        null,
        null
      );

      update public.inventory_units
      set status = 'available',
          online_order_id = null,
          sold_at = null
      where id = v_unit.id;

      insert into public.inventory_unit_events(
        inventory_unit_id, event_type, label, metadata
      )
      values (
        v_unit.id,
        'online_sale_cancelled',
        'Venda online cancelada e peça devolvida ao estoque',
        jsonb_build_object(
          'order_id', p_order_id,
          'reason', nullif(btrim(p_note), '')
        )
      );
    end loop;

    -- Mantém a regra atual: devolve o estoque pela quantidade do pedido.
    for v_item in
      select * from jsonb_array_elements(
        (select items from public.orders where id = p_order_id)
      )
    loop
      v_variant_id := nullif(v_item->>'variantId', '')::uuid;
      v_quantity := greatest(1, coalesce((v_item->>'quantity')::integer, 1));

      update public.product_variants
      set stock = stock + v_quantity
      where id = v_variant_id;

      -- Para pedidos pagos antes desta migração, pode não existir unidade
      -- individual marcada como sold_online. A sincronização recria apenas
      -- o que estiver faltando e não toca em peças de lotes ativos.
      perform public.sync_inventory_units_for_variant(v_variant_id);
    end loop;
  else
    perform public.release_order_reservations(p_order_id);
  end if;

  update public.orders
  set status = 'cancelled',
      admin_notes = coalesce(p_note, admin_notes),
      updated_at = now()
  where id = p_order_id;

  insert into public.order_events(
    order_id, event_type, label, note
  )
  values (
    p_order_id, 'status_changed', 'Pedido cancelado', p_note
  );

  return true;
end;
$$;

-- 14. VISÕES PARA "RODÍZIO AO VIVO"
create or replace view public.investment_lot_live as
select
  l.id,
  l.code,
  l.name,
  l.status,
  l.total_units,
  l.activated_at,
  l.completed_at,
  (
    select count(*)::integer
    from public.investment_sale_allocations a
    where a.lot_id = l.id and a.status = 'active'
  ) as sold_units,
  greatest(
    0,
    l.total_units - (
      select count(*)::integer
      from public.investment_sale_allocations a
      where a.lot_id = l.id and a.status = 'active'
    )
  ) as remaining_units,
  next_slot.slot_number as current_slot_number,
  next_slot.investor_id as current_investor_id,
  next_investor.name as current_investor_name,
  after_slot.slot_number as next_slot_number,
  after_slot.investor_id as next_investor_id,
  after_investor.name as next_investor_name
from public.investment_lots l
left join lateral (
  select s.slot_number, s.investor_id
  from public.investment_distribution_slots s
  where s.lot_id = l.id and s.status = 'pending'
  order by s.slot_number
  limit 1
) next_slot on true
left join public.investors next_investor
  on next_investor.id = next_slot.investor_id
left join lateral (
  select s.slot_number, s.investor_id
  from public.investment_distribution_slots s
  where s.lot_id = l.id
    and s.status = 'pending'
    and (next_slot.slot_number is null or s.slot_number > next_slot.slot_number)
  order by s.slot_number
  limit 1
) after_slot on true
left join public.investors after_investor
  on after_investor.id = after_slot.investor_id;

create or replace view public.investment_participant_live as
select
  p.lot_id,
  p.investor_id,
  i.code as investor_code,
  i.name as investor_name,
  p.purchased_units,
  p.draw_position,
  (
    select count(*)::integer
    from public.investment_sale_allocations a
    where a.lot_id = p.lot_id
      and a.investor_id = p.investor_id
      and a.status = 'active'
  ) as sold_units,
  greatest(
    0,
    p.purchased_units - (
      select count(*)::integer
      from public.investment_sale_allocations a
      where a.lot_id = p.lot_id
        and a.investor_id = p.investor_id
        and a.status = 'active'
    )
  ) as remaining_units,
  (
    select min(s.slot_number)
    from public.investment_distribution_slots s
    where s.lot_id = p.lot_id
      and s.investor_id = p.investor_id
      and s.status = 'pending'
  ) as next_slot_number
from public.investment_lot_participants p
join public.investors i on i.id = p.investor_id;

create or replace view public.investment_queue_live as
select
  s.lot_id,
  s.id as slot_id,
  s.slot_number,
  s.status as slot_status,
  s.draw_position,
  s.replacement_for_slot_id,
  i.id as investor_id,
  i.code as investor_code,
  i.name as investor_name,
  a.id as allocation_id,
  a.source_type,
  a.in_store_sale_id,
  a.online_order_id,
  a.gross_amount,
  a.status as allocation_status,
  a.created_at as sold_at
from public.investment_distribution_slots s
join public.investors i on i.id = s.investor_id
left join public.investment_sale_allocations a
  on a.slot_id = s.id;

-- 15. SEGURANÇA
alter table public.investors enable row level security;
alter table public.investment_lots enable row level security;
alter table public.investment_lot_participants enable row level security;
alter table public.investment_lot_items enable row level security;
alter table public.investment_distribution_slots enable row level security;
alter table public.investment_sale_allocations enable row level security;
alter table public.investment_events enable row level security;

revoke all on table public.investors from public, anon, authenticated;
revoke all on table public.investment_lots from public, anon, authenticated;
revoke all on table public.investment_lot_participants from public, anon, authenticated;
revoke all on table public.investment_lot_items from public, anon, authenticated;
revoke all on table public.investment_distribution_slots from public, anon, authenticated;
revoke all on table public.investment_sale_allocations from public, anon, authenticated;
revoke all on table public.investment_events from public, anon, authenticated;

grant all on table public.investors to service_role;
grant all on table public.investment_lots to service_role;
grant all on table public.investment_lot_participants to service_role;
grant all on table public.investment_lot_items to service_role;
grant all on table public.investment_distribution_slots to service_role;
grant all on table public.investment_sale_allocations to service_role;
grant all on table public.investment_events to service_role;

revoke all on table public.investment_lot_live from public, anon, authenticated;
revoke all on table public.investment_participant_live from public, anon, authenticated;
revoke all on table public.investment_queue_live from public, anon, authenticated;

grant select on table public.investment_lot_live to service_role;
grant select on table public.investment_participant_live to service_role;
grant select on table public.investment_queue_live to service_role;

revoke all on function public.set_investment_updated_at()
  from public, anon, authenticated;
revoke all on function public.set_investment_lot_participant(uuid, uuid, integer, uuid, text)
  from public, anon, authenticated;
revoke all on function public.set_investment_lot_item(uuid, uuid, integer, uuid, text)
  from public, anon, authenticated;
revoke all on function public.activate_investment_lot(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.cancel_draft_investment_lot(uuid, text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.allocate_investment_sale(uuid, text, uuid, numeric, uuid, text)
  from public, anon, authenticated;
revoke all on function public.reverse_investment_allocation_for_unit(uuid, text, uuid, text)
  from public, anon, authenticated;

grant execute on function public.set_investment_lot_participant(uuid, uuid, integer, uuid, text)
  to service_role;
grant execute on function public.set_investment_lot_item(uuid, uuid, integer, uuid, text)
  to service_role;
grant execute on function public.activate_investment_lot(uuid, uuid, text)
  to service_role;
grant execute on function public.cancel_draft_investment_lot(uuid, text, uuid, text)
  to service_role;
grant execute on function public.allocate_investment_sale(uuid, text, uuid, numeric, uuid, text)
  to service_role;
grant execute on function public.reverse_investment_allocation_for_unit(uuid, text, uuid, text)
  to service_role;

-- RPCs já existentes continuam apenas no backend.
revoke all on function public.sync_inventory_units_for_variant(uuid)
  from public, anon, authenticated;
revoke all on function public.register_in_store_sale(text, text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.cancel_in_store_sale(uuid, text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.confirm_paid_order(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.cancel_order(uuid, text)
  from public, anon, authenticated;

grant execute on function public.sync_inventory_units_for_variant(uuid)
  to service_role;
grant execute on function public.register_in_store_sale(text, text, uuid, text)
  to service_role;
grant execute on function public.cancel_in_store_sale(uuid, text, uuid, text)
  to service_role;
grant execute on function public.confirm_paid_order(uuid, text, text)
  to service_role;
grant execute on function public.cancel_order(uuid, text)
  to service_role;

commit;

-- 16. CONFIRMAÇÃO
select
  'INVESTIDORES ETAPA 1 INSTALADA' as resultado,
  (select count(*) from public.investors) as investidores,
  (select count(*) from public.investment_lots) as lotes,
  (select count(*) from public.investment_distribution_slots) as posicoes_rodizio,
  (select count(*) from public.investment_sale_allocations) as distribuicoes;
