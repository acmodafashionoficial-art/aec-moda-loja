-- A&C Moda — Investidores / Rodízio — Etapa 6
-- 1) Três formas de distribuição: sorteio, ordem definida e dono definido por peça.
-- 2) Convite individual por WhatsApp, válido por 7 dias e de uso único.
-- Execute depois da Etapa 5.

begin;

create extension if not exists pgcrypto;

-- ============================================================
-- 1. NOVAS REGRAS DE DISTRIBUIÇÃO
-- ============================================================

alter table public.investment_lots
  drop constraint if exists investment_lots_distribution_rule_check;

alter table public.investment_lots
  add constraint investment_lots_distribution_rule_check
  check (distribution_rule in (
    'round_robin_random',
    'round_robin_manual',
    'piece_assignment'
  ));

create table if not exists public.investment_piece_assignments (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.investment_lots(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  investor_id uuid not null references public.investors(id) on delete restrict,
  quantity integer not null check (quantity > 0 and quantity <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lot_id, variant_id, investor_id)
);

create index if not exists investment_piece_assignments_lot_idx
  on public.investment_piece_assignments(lot_id);

drop trigger if exists investment_piece_assignments_set_updated_at
  on public.investment_piece_assignments;
create trigger investment_piece_assignments_set_updated_at
before update on public.investment_piece_assignments
for each row execute function public.set_investment_updated_at();

alter table public.inventory_units
  add column if not exists investment_owner_investor_id uuid
    references public.investors(id) on delete restrict;

create index if not exists inventory_units_investment_owner_idx
  on public.inventory_units(investment_owner_investor_id, investment_lot_id, status)
  where investment_owner_investor_id is not null;

-- Distribuição fixa fica imutável depois da ativação.
create or replace function public.protect_fixed_investment_distribution()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot_id uuid;
  v_status text;
  v_rule text;
begin
  if tg_op = 'DELETE' then
    v_lot_id := old.lot_id;
  else
    v_lot_id := new.lot_id;
  end if;

  select status, distribution_rule
  into v_status, v_rule
  from public.investment_lots
  where id = v_lot_id;

  if v_status in ('active', 'completed') then
    if v_rule = 'piece_assignment' then
      raise exception 'A distribuição por peça fica travada depois da ativação. Apague e recrie o lote se houve erro antes das vendas.';
    end if;

    if v_rule = 'round_robin_manual'
       and tg_table_name = 'investment_lot_participants' then
      if tg_op in ('INSERT', 'DELETE') then
        raise exception 'A ordem manual dos investidores fica travada depois da ativação.';
      end if;

      if new.investor_id is distinct from old.investor_id
         or new.draw_position is distinct from old.draw_position then
        raise exception 'A ordem manual dos investidores fica travada depois da ativação.';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists protect_fixed_distribution_participants
  on public.investment_lot_participants;
create trigger protect_fixed_distribution_participants
before insert or update or delete on public.investment_lot_participants
for each row execute function public.protect_fixed_investment_distribution();

drop trigger if exists protect_fixed_distribution_items
  on public.investment_lot_items;
create trigger protect_fixed_distribution_items
before insert or update or delete on public.investment_lot_items
for each row execute function public.protect_fixed_investment_distribution();

drop trigger if exists protect_fixed_distribution_piece_assignments
  on public.investment_piece_assignments;
create trigger protect_fixed_distribution_piece_assignments
before insert or update or delete on public.investment_piece_assignments
for each row execute function public.protect_fixed_investment_distribution();

-- ============================================================
-- 2. CONVITES DO PORTAL POR LINK / WHATSAPP
-- ============================================================

create table if not exists public.investor_portal_invites (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid not null references public.investors(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique check (char_length(token_hash) = 64),
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_by_user_id uuid,
  created_by_email text,
  created_at timestamptz not null default now()
);

create index if not exists investor_portal_invites_investor_idx
  on public.investor_portal_invites(investor_id, created_at desc);

create index if not exists investor_portal_invites_active_idx
  on public.investor_portal_invites(expires_at)
  where used_at is null and revoked_at is null;

create or replace function public.consume_investor_portal_invite(
  p_token_hash text
)
returns table (
  invite_id uuid,
  auth_user_id uuid,
  investor_id uuid,
  email text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.investor_portal_invites;
  v_email text;
  v_portal_status text;
  v_investor_active boolean;
begin
  if p_token_hash is null or char_length(btrim(p_token_hash)) <> 64 then
    raise exception 'Link de convite inválido';
  end if;

  select * into v_invite
  from public.investor_portal_invites
  where token_hash = lower(btrim(p_token_hash))
  for update;

  if not found then
    raise exception 'O link expirou ou já foi utilizado';
  end if;

  if v_invite.used_at is not null
     or v_invite.revoked_at is not null
     or v_invite.expires_at <= now() then
    raise exception 'O link expirou ou já foi utilizado';
  end if;

  select ipu.email::text, ipu.status, i.active
  into v_email, v_portal_status, v_investor_active
  from public.investor_portal_users ipu
  join public.investors i on i.id = ipu.investor_id
  where ipu.auth_user_id = v_invite.auth_user_id
    and ipu.investor_id = v_invite.investor_id;

  if not found or v_investor_active is false then
    raise exception 'Este acesso não está mais disponível';
  end if;

  if v_portal_status = 'disabled' then
    raise exception 'Este acesso foi bloqueado pela administração';
  end if;

  update public.investor_portal_invites
  set used_at = now()
  where id = v_invite.id;

  return query
  select v_invite.id, v_invite.auth_user_id, v_invite.investor_id, v_email;
end;
$$;

-- ============================================================
-- 3. CRIAÇÃO DE LOTE COM A REGRA ESCOLHIDA
-- ============================================================

create or replace function public.create_and_activate_investment_lot_v2(
  p_name text,
  p_participants jsonb,
  p_items jsonb,
  p_distribution_rule text default 'round_robin_random',
  p_manual_order jsonb default '[]'::jsonb,
  p_piece_assignments jsonb default '[]'::jsonb,
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
  v_name text;
  v_rule text;
  v_participant record;
  v_item record;
  v_assignment record;
  v_participant_count integer := 0;
  v_item_count integer := 0;
  v_position integer;
  v_manual_count integer;
begin
  v_name := btrim(coalesce(p_name, ''));
  v_rule := btrim(coalesce(p_distribution_rule, 'round_robin_random'));

  if char_length(v_name) < 2 or char_length(v_name) > 160 then
    raise exception 'Informe um nome válido para o lote';
  end if;

  if v_rule not in ('round_robin_random', 'round_robin_manual', 'piece_assignment') then
    raise exception 'Regra de distribuição inválida';
  end if;

  if jsonb_typeof(p_participants) <> 'array'
     or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Dados do lote inválidos';
  end if;

  if jsonb_array_length(p_participants) < 1 then
    raise exception 'Selecione pelo menos um investidor';
  end if;
  if jsonb_array_length(p_items) < 1 then
    raise exception 'Selecione pelo menos uma peça';
  end if;

  if jsonb_array_length(p_participants) > 100
     or jsonb_array_length(p_items) > 500 then
    raise exception 'Quantidade de itens acima do limite';
  end if;

  if v_rule = 'round_robin_manual' then
    if jsonb_typeof(p_manual_order) <> 'array' then
      raise exception 'Ordem manual inválida';
    end if;

    select count(*)::integer into v_manual_count
    from jsonb_array_elements_text(p_manual_order);

    if v_manual_count <> jsonb_array_length(p_participants) then
      raise exception 'A ordem manual precisa conter todos os investidores participantes';
    end if;

    if (
      select count(*)
      from jsonb_array_elements_text(p_manual_order)
    ) <> (
      select count(distinct value)
      from jsonb_array_elements_text(p_manual_order)
    ) then
      raise exception 'Há investidor repetido na ordem manual';
    end if;
  end if;

  insert into public.investment_lots(
    name,
    status,
    distribution_rule,
    stock_source,
    created_by_user_id,
    created_by_email
  )
  values (
    v_name,
    'draft',
    v_rule,
    'catalog_linked',
    p_actor_user_id,
    nullif(btrim(coalesce(p_actor_email, '')), '')
  )
  returning id into v_lot_id;

  for v_participant in
    select *
    from jsonb_to_recordset(p_participants)
      as x(investor_id uuid, units integer)
  loop
    if v_participant.investor_id is null
       or v_participant.units is null
       or v_participant.units < 1
       or v_participant.units > 10000 then
      raise exception 'Investidor ou quantidade inválida no lote';
    end if;

    if not exists (
      select 1 from public.investors
      where id = v_participant.investor_id and active = true
    ) then
      raise exception 'Um dos investidores não existe ou está inativo';
    end if;

    v_position := null;
    if v_rule = 'round_robin_manual' then
      select ordinality::integer
      into v_position
      from jsonb_array_elements_text(p_manual_order) with ordinality as m(value, ordinality)
      where value::uuid = v_participant.investor_id;

      if v_position is null then
        raise exception 'Um investidor participante não está na ordem manual';
      end if;
    elsif v_rule = 'piece_assignment' then
      v_position := v_participant_count + 1;
    end if;

    insert into public.investment_lot_participants(
      lot_id, investor_id, purchased_units, draw_position
    ) values (
      v_lot_id, v_participant.investor_id, v_participant.units, v_position
    );

    v_participant_count := v_participant_count + 1;
  end loop;

  for v_item in
    select *
    from jsonb_to_recordset(p_items)
      as x(variant_id uuid, quantity integer)
  loop
    if v_item.variant_id is null
       or v_item.quantity is null
       or v_item.quantity < 1
       or v_item.quantity > 10000 then
      raise exception 'Peça ou quantidade inválida no lote';
    end if;

    if not exists (
      select 1
      from public.product_variants pv
      join public.products p on p.id = pv.product_id
      where pv.id = v_item.variant_id
        and pv.active = true
        and p.active = true
    ) then
      raise exception 'Uma das peças selecionadas não existe ou está inativa';
    end if;

    insert into public.investment_lot_items(lot_id, variant_id, quantity)
    values (v_lot_id, v_item.variant_id, v_item.quantity);

    v_item_count := v_item_count + 1;
  end loop;

  if v_rule = 'piece_assignment' then
    if jsonb_typeof(p_piece_assignments) <> 'array'
       or jsonb_array_length(p_piece_assignments) < 1 then
      raise exception 'Defina de qual investidor é cada roupa';
    end if;

    for v_assignment in
      select *
      from jsonb_to_recordset(p_piece_assignments)
        as x(variant_id uuid, investor_id uuid, quantity integer)
    loop
      if v_assignment.variant_id is null
         or v_assignment.investor_id is null
         or v_assignment.quantity is null
         or v_assignment.quantity < 1
         or v_assignment.quantity > 10000 then
        raise exception 'Distribuição por peça inválida';
      end if;

      if not exists (
        select 1 from public.investment_lot_items
        where lot_id = v_lot_id and variant_id = v_assignment.variant_id
      ) then
        raise exception 'Uma roupa distribuída não pertence ao lote';
      end if;

      if not exists (
        select 1 from public.investment_lot_participants
        where lot_id = v_lot_id and investor_id = v_assignment.investor_id
      ) then
        raise exception 'Um investidor da distribuição não participa do lote';
      end if;

      insert into public.investment_piece_assignments(
        lot_id, variant_id, investor_id, quantity
      ) values (
        v_lot_id, v_assignment.variant_id, v_assignment.investor_id, v_assignment.quantity
      );
    end loop;

    if exists (
      select 1
      from public.investment_lot_items li
      left join (
        select variant_id, sum(quantity)::integer as quantity
        from public.investment_piece_assignments
        where lot_id = v_lot_id
        group by variant_id
      ) a on a.variant_id = li.variant_id
      where li.lot_id = v_lot_id
        and coalesce(a.quantity, 0) <> li.quantity
    ) then
      raise exception 'A divisão por peça não fecha com a quantidade de uma das roupas';
    end if;

    if exists (
      select 1
      from public.investment_lot_participants lp
      left join (
        select investor_id, sum(quantity)::integer as quantity
        from public.investment_piece_assignments
        where lot_id = v_lot_id
        group by investor_id
      ) a on a.investor_id = lp.investor_id
      where lp.lot_id = v_lot_id
        and coalesce(a.quantity, 0) <> lp.purchased_units
    ) then
      raise exception 'A divisão por peça não fecha com a quantidade de um dos investidores';
    end if;
  end if;

  perform public.activate_investment_lot(
    v_lot_id,
    p_actor_user_id,
    p_actor_email
  );

  return v_lot_id;
exception
  when unique_violation then
    raise exception 'Há investidor, roupa ou distribuição repetida no lote';
end;
$$;

-- ============================================================
-- 4. ATIVAÇÃO: RESPEITA A REGRA ESCOLHIDA
-- ============================================================

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
  v_assignment record;
  v_available integer;
  v_linked integer;
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
    raise exception 'Este lote já possui uma ordem gravada e não pode ser ativado novamente';
  end if;

  select coalesce(sum(purchased_units), 0)
  into v_participant_units
  from public.investment_lot_participants
  where lot_id = p_lot_id;

  select coalesce(sum(quantity), 0)
  into v_item_units
  from public.investment_lot_items
  where lot_id = p_lot_id;

  if v_participant_units <= 0 then raise exception 'Adicione pelo menos um investidor ao lote'; end if;
  if v_item_units <= 0 then raise exception 'Adicione pelo menos uma peça ao lote'; end if;
  if v_participant_units <> v_item_units then
    raise exception 'A soma das participações deve ser igual ao total de peças: investidores %, peças %',
      v_participant_units, v_item_units;
  end if;

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

  for v_item in
    select variant_id, quantity
    from public.investment_lot_items
    where lot_id = p_lot_id
    order by created_at, id
  loop
    select count(*)::integer into v_available
    from public.inventory_units iu
    where iu.variant_id = v_item.variant_id
      and iu.status = 'available'
      and iu.investment_lot_id is null;

    if v_available < v_item.quantity then
      raise exception 'Estoque livre insuficiente para o lote. Disponível sem outro lote: %, solicitado: %',
        v_available, v_item.quantity;
    end if;
  end loop;

  if v_lot.distribution_rule = 'round_robin_random' then
    with randomized as (
      select id, row_number() over (order by gen_random_uuid())::integer as draw_position
      from public.investment_lot_participants
      where lot_id = p_lot_id
    )
    update public.investment_lot_participants p
    set draw_position = r.draw_position
    from randomized r
    where p.id = r.id;
  elsif v_lot.distribution_rule = 'round_robin_manual' then
    if exists (
      select 1 from public.investment_lot_participants
      where lot_id = p_lot_id and draw_position is null
    ) then
      raise exception 'A ordem manual não foi preenchida completamente';
    end if;
  else
    -- Na distribuição por peça a posição é apenas informativa.
    with ordered as (
      select id, row_number() over (order by draw_position nulls last, created_at, id)::integer as position
      from public.investment_lot_participants
      where lot_id = p_lot_id
    )
    update public.investment_lot_participants p
    set draw_position = o.position
    from ordered o
    where p.id = o.id;

    if exists (
      select 1
      from public.investment_lot_items li
      left join (
        select variant_id, sum(quantity)::integer as quantity
        from public.investment_piece_assignments
        where lot_id = p_lot_id
        group by variant_id
      ) a on a.variant_id = li.variant_id
      where li.lot_id = p_lot_id and coalesce(a.quantity, 0) <> li.quantity
    ) then
      raise exception 'A distribuição por peça está incompleta';
    end if;
  end if;

  select max(purchased_units)
  into v_max_round
  from public.investment_lot_participants
  where lot_id = p_lot_id;

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
      ) values (
        p_lot_id, v_slot_number, v_participant.investor_id,
        v_participant.draw_position, 'pending'
      );
    end loop;
  end loop;

  if v_slot_number <> v_participant_units then
    raise exception 'Falha de segurança ao gerar as posições do lote';
  end if;

  if v_lot.distribution_rule = 'piece_assignment' then
    for v_assignment in
      select variant_id, investor_id, quantity
      from public.investment_piece_assignments
      where lot_id = p_lot_id
      order by created_at, id
    loop
      with target as (
        select iu.id
        from public.inventory_units iu
        where iu.variant_id = v_assignment.variant_id
          and iu.status = 'available'
          and iu.investment_lot_id is null
        order by iu.created_at, iu.id
        limit v_assignment.quantity
        for update skip locked
      ), changed as (
        update public.inventory_units iu
        set
          investment_lot_id = p_lot_id,
          investment_owner_investor_id = v_assignment.investor_id,
          updated_at = now()
        from target t
        where iu.id = t.id
        returning iu.id
      ), logged as (
        insert into public.inventory_unit_events(
          inventory_unit_id, event_type, label, metadata, actor_user_id, actor_email
        )
        select
          c.id,
          'investment_piece_owner_defined',
          'Peça vinculada ao investidor definido no lote',
          jsonb_build_object(
            'lot_id', p_lot_id,
            'investor_id', v_assignment.investor_id,
            'variant_id', v_assignment.variant_id
          ),
          p_actor_user_id,
          nullif(btrim(coalesce(p_actor_email, '')), '')
        from changed c
        returning inventory_unit_id
      )
      select count(*)::integer into v_linked from logged;

      if v_linked <> v_assignment.quantity then
        raise exception 'Não foi possível vincular todas as peças ao investidor definido';
      end if;
    end loop;
  else
    for v_item in
      select variant_id, quantity
      from public.investment_lot_items
      where lot_id = p_lot_id
      order by created_at, id
    loop
      with target as (
        select iu.id
        from public.inventory_units iu
        where iu.variant_id = v_item.variant_id
          and iu.status = 'available'
          and iu.investment_lot_id is null
        order by iu.created_at, iu.id
        limit v_item.quantity
        for update skip locked
      ), changed as (
        update public.inventory_units iu
        set
          investment_lot_id = p_lot_id,
          investment_owner_investor_id = null,
          updated_at = now()
        from target t
        where iu.id = t.id
        returning iu.id
      ), logged as (
        insert into public.inventory_unit_events(
          inventory_unit_id, event_type, label, metadata, actor_user_id, actor_email
        )
        select
          c.id,
          'investment_lot_linked_existing_stock',
          'Peça existente vinculada ao lote de investidores',
          jsonb_build_object('lot_id', p_lot_id),
          p_actor_user_id,
          nullif(btrim(coalesce(p_actor_email, '')), '')
        from changed c
        returning inventory_unit_id
      )
      select count(*)::integer into v_linked from logged;

      if v_linked <> v_item.quantity then
        raise exception 'Não foi possível vincular todas as peças existentes ao lote';
      end if;
    end loop;
  end if;

  update public.investment_lots
  set
    status = 'active',
    stock_source = 'catalog_linked',
    total_units = v_participant_units,
    draw_locked_at = now(),
    activated_at = now(),
    completed_at = null
  where id = p_lot_id;

  insert into public.investment_events(
    lot_id, event_type, label, metadata, actor_user_id, actor_email
  ) values (
    p_lot_id,
    'lot_activated',
    case v_lot.distribution_rule
      when 'round_robin_manual' then 'Lote ativado com ordem definida pelo administrador'
      when 'piece_assignment' then 'Lote ativado com dono definido para cada peça'
      else 'Lote ativado com sorteio automático'
    end,
    jsonb_build_object(
      'total_units', v_participant_units,
      'total_slots', v_slot_number,
      'distribution_rule', v_lot.distribution_rule,
      'stock_source', 'catalog_linked'
    ),
    p_actor_user_id,
    nullif(btrim(coalesce(p_actor_email, '')), '')
  );

  return true;
end;
$$;

-- ============================================================
-- 5. VENDA: RODÍZIO OU DONO FIXO DA UNIDADE
-- ============================================================

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
  v_owner_investor_id uuid;
  v_lot_status text;
  v_distribution_rule text;
  v_slot public.investment_distribution_slots;
  v_allocation_id uuid;
begin
  if p_source_type not in ('store_sale', 'online_order') then
    raise exception 'Origem de venda inválida';
  end if;
  if p_source_id is null then raise exception 'Origem da venda não informada'; end if;
  if p_gross_amount is null or p_gross_amount < 0 then raise exception 'Valor da venda inválido'; end if;

  select investment_lot_id, investment_owner_investor_id
  into v_lot_id, v_owner_investor_id
  from public.inventory_units
  where id = p_inventory_unit_id
  for update;

  if not found then raise exception 'Peça física não encontrada'; end if;
  if v_lot_id is null then return null; end if;

  select status, distribution_rule
  into v_lot_status, v_distribution_rule
  from public.investment_lots
  where id = v_lot_id
  for update;

  if not found then raise exception 'Lote vinculado à peça não encontrado'; end if;
  if v_lot_status <> 'active' then raise exception 'O lote desta peça não está ativo para distribuição'; end if;

  if exists (
    select 1 from public.investment_sale_allocations
    where inventory_unit_id = p_inventory_unit_id and status = 'active'
  ) then
    raise exception 'Esta peça já possui uma distribuição ativa';
  end if;

  if v_distribution_rule = 'piece_assignment' then
    if v_owner_investor_id is null then
      raise exception 'Esta peça não possui investidor definido';
    end if;

    select * into v_slot
    from public.investment_distribution_slots
    where lot_id = v_lot_id
      and investor_id = v_owner_investor_id
      and status = 'pending'
    order by slot_number
    limit 1
    for update;
  else
    select * into v_slot
    from public.investment_distribution_slots
    where lot_id = v_lot_id and status = 'pending'
    order by slot_number
    limit 1
    for update;
  end if;

  if not found then
    raise exception 'O lote não possui uma posição disponível para esta venda';
  end if;

  insert into public.investment_sale_allocations(
    lot_id, slot_id, investor_id, inventory_unit_id,
    source_type, in_store_sale_id, online_order_id, gross_amount, status
  ) values (
    v_lot_id,
    v_slot.id,
    v_slot.investor_id,
    p_inventory_unit_id,
    p_source_type,
    case when p_source_type = 'store_sale' then p_source_id else null end,
    case when p_source_type = 'online_order' then p_source_id else null end,
    round(p_gross_amount, 2),
    'active'
  ) returning id into v_allocation_id;

  update public.investment_distribution_slots
  set status = 'allocated', allocated_at = now()
  where id = v_slot.id;

  insert into public.investment_events(
    lot_id, investor_id, event_type, label, metadata, actor_user_id, actor_email
  ) values (
    v_lot_id,
    v_slot.investor_id,
    'sale_allocated',
    case when v_distribution_rule = 'piece_assignment'
      then 'Venda atribuída ao dono definido da peça'
      else 'Venda distribuída pelo rodízio'
    end,
    jsonb_build_object(
      'allocation_id', v_allocation_id,
      'slot_id', v_slot.id,
      'slot_number', v_slot.slot_number,
      'inventory_unit_id', p_inventory_unit_id,
      'source_type', p_source_type,
      'source_id', p_source_id,
      'gross_amount', round(p_gross_amount, 2),
      'distribution_rule', v_distribution_rule
    ),
    p_actor_user_id,
    nullif(btrim(coalesce(p_actor_email, '')), '')
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

-- Ao apagar um lote, peças ainda disponíveis voltam ao estoque livre e perdem o dono fixo.
create or replace function public.archive_investment_lot(
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
  v_lot public.investment_lots;
begin
  select * into v_lot
  from public.investment_lots
  where id = p_lot_id
  for update;

  if not found then raise exception 'Lote não encontrado'; end if;
  if v_lot.archived_at is not null then return false; end if;

  with changed as (
    update public.inventory_units iu
    set
      investment_lot_id = null,
      investment_owner_investor_id = null,
      updated_at = now()
    where iu.investment_lot_id = p_lot_id
      and iu.status = 'available'
    returning iu.id
  )
  insert into public.inventory_unit_events(
    inventory_unit_id, event_type, label, metadata, actor_user_id, actor_email
  )
  select
    c.id,
    'investment_lot_archived_unlinked',
    'Peça liberada porque o lote foi apagado',
    jsonb_build_object('lot_id', p_lot_id),
    p_actor_user_id,
    nullif(btrim(coalesce(p_actor_email, '')), '')
  from changed c;

  delete from public.investment_distribution_slots
  where lot_id = p_lot_id and status = 'pending';

  update public.investment_lots
  set
    status = 'cancelled',
    cancelled_at = coalesce(cancelled_at, now()),
    cancellation_reason = coalesce(
      nullif(btrim(coalesce(p_reason, '')), ''),
      'Lote apagado pelo painel administrativo'
    ),
    archived_at = now(),
    archived_by_user_id = p_actor_user_id,
    archived_by_email = nullif(btrim(coalesce(p_actor_email, '')), '')
  where id = p_lot_id;

  insert into public.investment_events(
    lot_id, event_type, label, metadata, actor_user_id, actor_email
  ) values (
    p_lot_id,
    'lot_archived',
    'Lote apagado do gerenciamento; peças livres mantidas no estoque',
    jsonb_build_object(
      'code', v_lot.code,
      'name', v_lot.name,
      'reason', coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Lote apagado pelo painel administrativo'),
      'stock_was_changed', false
    ),
    p_actor_user_id,
    nullif(btrim(coalesce(p_actor_email, '')), '')
  );

  return true;
end;
$$;

-- ============================================================
-- 6. VISÃO DO PAINEL / PORTAL
-- ============================================================

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
  case when l.distribution_rule = 'piece_assignment' then null else next_slot.slot_number end as current_slot_number,
  case when l.distribution_rule = 'piece_assignment' then null else next_slot.investor_id end as current_investor_id,
  case when l.distribution_rule = 'piece_assignment' then null else next_investor.name end as current_investor_name,
  case when l.distribution_rule = 'piece_assignment' then null else after_slot.slot_number end as next_slot_number,
  case when l.distribution_rule = 'piece_assignment' then null else after_slot.investor_id end as next_investor_id,
  case when l.distribution_rule = 'piece_assignment' then null else after_investor.name end as next_investor_name,
  l.distribution_rule
from public.investment_lots l
left join lateral (
  select s.slot_number, s.investor_id
  from public.investment_distribution_slots s
  where s.lot_id = l.id and s.status = 'pending'
  order by s.slot_number
  limit 1
) next_slot on true
left join public.investors next_investor on next_investor.id = next_slot.investor_id
left join lateral (
  select s.slot_number, s.investor_id
  from public.investment_distribution_slots s
  where s.lot_id = l.id
    and s.status = 'pending'
    and (next_slot.slot_number is null or s.slot_number > next_slot.slot_number)
  order by s.slot_number
  limit 1
) after_slot on true
left join public.investors after_investor on after_investor.id = after_slot.investor_id
where l.archived_at is null;

-- ============================================================
-- 7. SEGURANÇA
-- ============================================================

alter table public.investment_piece_assignments enable row level security;
alter table public.investor_portal_invites enable row level security;

revoke all on table public.investment_piece_assignments from public, anon, authenticated;
revoke all on table public.investor_portal_invites from public, anon, authenticated;
grant all on table public.investment_piece_assignments to service_role;
grant all on table public.investor_portal_invites to service_role;

revoke all on function public.protect_fixed_investment_distribution() from public, anon, authenticated;
revoke all on function public.consume_investor_portal_invite(text) from public, anon, authenticated;
revoke all on function public.create_and_activate_investment_lot_v2(text, jsonb, jsonb, text, jsonb, jsonb, uuid, text) from public, anon, authenticated;
revoke all on function public.activate_investment_lot(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.allocate_investment_sale(uuid, text, uuid, numeric, uuid, text) from public, anon, authenticated;
revoke all on function public.archive_investment_lot(uuid, text, uuid, text) from public, anon, authenticated;

grant execute on function public.consume_investor_portal_invite(text) to service_role;
grant execute on function public.create_and_activate_investment_lot_v2(text, jsonb, jsonb, text, jsonb, jsonb, uuid, text) to service_role;
grant execute on function public.activate_investment_lot(uuid, uuid, text) to service_role;
grant execute on function public.allocate_investment_sale(uuid, text, uuid, numeric, uuid, text) to service_role;
grant execute on function public.archive_investment_lot(uuid, text, uuid, text) to service_role;

revoke all on table public.investment_lot_live from public, anon, authenticated;
grant select on table public.investment_lot_live to service_role;

commit;

select
  'INVESTIDORES ETAPA 6 INSTALADA' as resultado,
  (select count(*) from public.investment_lots where archived_at is null) as lotes_ativos_ou_visiveis,
  (select count(*) from public.investor_portal_invites where used_at is null and revoked_at is null and expires_at > now()) as convites_validos;
