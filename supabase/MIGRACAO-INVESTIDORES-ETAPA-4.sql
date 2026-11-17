-- A&C Moda — Investidores / Rodízio — Etapa 4
-- Edição segura de lotes + apagar/arquivar lote sem destruir histórico.
-- Execute depois das Etapas 1, 2 e 3.
--
-- O que esta etapa faz:
-- - permite editar nome, participantes, quantidades e roupas de um lote já ativo;
-- - preserva vendas já confirmadas;
-- - preserva a parte já consumida da ordem;
-- - ajusta apenas as posições futuras quando quantidades mudam;
-- - ao aumentar peças, adiciona estoque físico;
-- - ao reduzir, retira apenas unidades ainda disponíveis;
-- - "Apagar lote" remove o lote das telas, tira do estoque as peças não vendidas
--   e mantém as vendas/auditoria já ocorridas.

begin;

alter table public.investment_lots
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by_user_id uuid,
  add column if not exists archived_by_email text;

create index if not exists investment_lots_archived_idx
  on public.investment_lots(archived_at)
  where archived_at is not null;

-- ============================================================
-- 1. EDITAR LOTE ATIVO/CONCLUÍDO SEM APAGAR VENDAS PASSADAS
-- ============================================================

create or replace function public.update_investment_lot(
  p_lot_id uuid,
  p_name text,
  p_participants jsonb,
  p_items jsonb,
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
  v_name text;
  v_old_total integer;
  v_participant_total integer;
  v_item_total integer;
  v_active_sales integer;
  v_max_draw integer;
  v_max_slot integer;
  v_max_extra integer;
  v_round integer;
  v_row record;
  v_old_quantity integer;
  v_new_quantity integer;
  v_delta integer;
  v_remove_count integer;
  v_available_count integer;
  v_stock integer;
  v_reserved integer;
begin
  select * into v_lot
  from public.investment_lots
  where id = p_lot_id
  for update;

  if not found then
    raise exception 'Lote não encontrado';
  end if;

  if v_lot.archived_at is not null then
    raise exception 'Este lote já foi apagado';
  end if;

  if v_lot.status = 'cancelled' then
    raise exception 'Um lote cancelado não pode ser editado';
  end if;

  v_name := btrim(coalesce(p_name, ''));
  if char_length(v_name) < 2 or char_length(v_name) > 160 then
    raise exception 'Informe um nome válido para o lote';
  end if;

  if jsonb_typeof(p_participants) <> 'array' then
    raise exception 'Lista de investidores inválida';
  end if;

  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'Lista de peças inválida';
  end if;

  if jsonb_array_length(p_participants) < 1 then
    raise exception 'Selecione pelo menos um investidor';
  end if;

  if jsonb_array_length(p_items) < 1 then
    raise exception 'Selecione pelo menos uma peça';
  end if;

  if jsonb_array_length(p_participants) > 100 then
    raise exception 'Quantidade de investidores acima do limite';
  end if;

  if jsonb_array_length(p_items) > 500 then
    raise exception 'Quantidade de variações acima do limite';
  end if;

  -- Não aceita repetição nem quantidades inválidas.
  if exists (
    select 1
    from jsonb_to_recordset(p_participants)
      as x(investor_id uuid, units integer)
    where x.investor_id is null
      or x.units is null
      or x.units < 1
      or x.units > 10000
  ) then
    raise exception 'Há investidor ou quantidade inválida no lote';
  end if;

  if (
    select count(*)
    from jsonb_to_recordset(p_participants)
      as x(investor_id uuid, units integer)
  ) <> (
    select count(distinct x.investor_id)
    from jsonb_to_recordset(p_participants)
      as x(investor_id uuid, units integer)
  ) then
    raise exception 'Há investidor repetido no lote';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_participants)
      as x(investor_id uuid, units integer)
    left join public.investors i on i.id = x.investor_id
    where i.id is null
       or (
         i.active is false
         and not exists (
           select 1
           from public.investment_lot_participants lp
           where lp.lot_id = p_lot_id
             and lp.investor_id = x.investor_id
         )
       )
  ) then
    raise exception 'Um investidor não existe, está inativo ou não fazia parte deste lote';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items)
      as x(variant_id uuid, quantity integer)
    where x.variant_id is null
      or x.quantity is null
      or x.quantity < 1
      or x.quantity > 10000
  ) then
    raise exception 'Há peça ou quantidade inválida no lote';
  end if;

  if (
    select count(*)
    from jsonb_to_recordset(p_items)
      as x(variant_id uuid, quantity integer)
  ) <> (
    select count(distinct x.variant_id)
    from jsonb_to_recordset(p_items)
      as x(variant_id uuid, quantity integer)
  ) then
    raise exception 'Há variação de produto repetida no lote';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items)
      as x(variant_id uuid, quantity integer)
    left join public.product_variants pv on pv.id = x.variant_id
    left join public.products p on p.id = pv.product_id
    where pv.id is null
      or p.id is null
      or pv.active is false
      or p.active is false
  ) then
    raise exception 'Uma das peças selecionadas não existe ou está inativa';
  end if;

  select coalesce(sum(x.units), 0)::integer
  into v_participant_total
  from jsonb_to_recordset(p_participants)
    as x(investor_id uuid, units integer);

  select coalesce(sum(x.quantity), 0)::integer
  into v_item_total
  from jsonb_to_recordset(p_items)
    as x(variant_id uuid, quantity integer);

  if v_participant_total <> v_item_total then
    raise exception
      'As quantidades não fecham: investidores %, peças %',
      v_participant_total, v_item_total;
  end if;

  v_old_total := v_lot.total_units;

  -- Nunca deixa um investidor abaixo das vendas que já são dele.
  if exists (
    with requested as (
      select x.investor_id, x.units
      from jsonb_to_recordset(p_participants)
        as x(investor_id uuid, units integer)
    ), sold as (
      select a.investor_id, count(*)::integer as sold_units
      from public.investment_sale_allocations a
      where a.lot_id = p_lot_id
        and a.status = 'active'
      group by a.investor_id
    )
    select 1
    from sold s
    left join requested r on r.investor_id = s.investor_id
    where r.investor_id is null
       or r.units < s.sold_units
  ) then
    raise exception 'A quantidade de um investidor não pode ficar menor que as vendas já confirmadas para ele';
  end if;

  -- Nunca reduz uma variação abaixo das unidades dessa variação já vendidas.
  if exists (
    with requested as (
      select x.variant_id, x.quantity
      from jsonb_to_recordset(p_items)
        as x(variant_id uuid, quantity integer)
    ), sold as (
      select iu.variant_id, count(*)::integer as sold_units
      from public.inventory_units iu
      where iu.investment_lot_id = p_lot_id
        and iu.status in ('sold_store', 'sold_online')
      group by iu.variant_id
    )
    select 1
    from sold s
    left join requested r on r.variant_id = s.variant_id
    where r.variant_id is null
       or r.quantity < s.sold_units
  ) then
    raise exception 'A quantidade de uma roupa não pode ficar menor que as unidades dessa roupa já vendidas';
  end if;

  -- ==========================================================
  -- 1A. AJUSTA O ESTOQUE FÍSICO DO LOTE VARIAÇÃO POR VARIAÇÃO
  -- ==========================================================

  for v_row in
    with requested as (
      select x.variant_id, x.quantity
      from jsonb_to_recordset(p_items)
        as x(variant_id uuid, quantity integer)
    ), current_items as (
      select li.variant_id, li.quantity
      from public.investment_lot_items li
      where li.lot_id = p_lot_id
    )
    select
      coalesce(r.variant_id, c.variant_id) as variant_id,
      coalesce(c.quantity, 0)::integer as old_quantity,
      coalesce(r.quantity, 0)::integer as new_quantity
    from requested r
    full join current_items c on c.variant_id = r.variant_id
  loop
    v_old_quantity := v_row.old_quantity;
    v_new_quantity := v_row.new_quantity;
    v_delta := v_new_quantity - v_old_quantity;

    if v_delta < 0 then
      v_remove_count := abs(v_delta);

      select pv.stock, coalesce(pv.reserved_stock, 0)
      into v_stock, v_reserved
      from public.product_variants pv
      where pv.id = v_row.variant_id
      for update;

      if not found then
        raise exception 'Variação do lote não encontrada';
      end if;

      select count(*)::integer
      into v_available_count
      from public.inventory_units iu
      where iu.investment_lot_id = p_lot_id
        and iu.variant_id = v_row.variant_id
        and iu.status = 'available';

      if v_available_count < v_remove_count then
        raise exception 'Não há peças livres suficientes desta roupa para reduzir a quantidade';
      end if;

      if (v_stock - v_reserved) < v_remove_count then
        raise exception 'Há peça(s) desta variação reservada(s) em pedido. Aguarde a reserva expirar ou finalize/cancele o pedido antes de reduzir o lote';
      end if;

      update public.product_variants
      set stock = stock - v_remove_count
      where id = v_row.variant_id;

      with target as (
        select iu.id
        from public.inventory_units iu
        where iu.investment_lot_id = p_lot_id
          and iu.variant_id = v_row.variant_id
          and iu.status = 'available'
        order by iu.created_at desc, iu.id desc
        limit v_remove_count
        for update
      ), changed as (
        update public.inventory_units iu
        set status = 'inactive',
            updated_at = now()
        from target t
        where iu.id = t.id
        returning iu.id
      )
      insert into public.inventory_unit_events(
        inventory_unit_id,
        event_type,
        label,
        metadata,
        actor_user_id,
        actor_email
      )
      select
        c.id,
        'investment_lot_adjusted_out',
        'Peça retirada por correção do lote de investidores',
        jsonb_build_object('lot_id', p_lot_id),
        p_actor_user_id,
        nullif(btrim(coalesce(p_actor_email, '')), '')
      from changed c;

    elsif v_delta > 0 then
      update public.product_variants
      set stock = stock + v_delta
      where id = v_row.variant_id
        and active = true;

      if not found then
        raise exception 'Uma variação do lote deixou de estar ativa';
      end if;

      with created_units as (
        insert into public.inventory_units(variant_id, investment_lot_id)
        select v_row.variant_id, p_lot_id
        from generate_series(1, v_delta)
        returning id
      )
      insert into public.inventory_unit_events(
        inventory_unit_id,
        event_type,
        label,
        metadata,
        actor_user_id,
        actor_email
      )
      select
        cu.id,
        'investment_lot_adjusted_in',
        'Peça adicionada por correção do lote de investidores',
        jsonb_build_object('lot_id', p_lot_id),
        p_actor_user_id,
        nullif(btrim(coalesce(p_actor_email, '')), '')
      from created_units cu;
    end if;
  end loop;

  delete from public.investment_lot_items li
  where li.lot_id = p_lot_id
    and not exists (
      select 1
      from jsonb_to_recordset(p_items)
        as x(variant_id uuid, quantity integer)
      where x.variant_id = li.variant_id
    );

  insert into public.investment_lot_items(lot_id, variant_id, quantity)
  select p_lot_id, x.variant_id, x.quantity
  from jsonb_to_recordset(p_items)
    as x(variant_id uuid, quantity integer)
  on conflict (lot_id, variant_id)
  do update set quantity = excluded.quantity;

  -- ==========================================================
  -- 1B. AJUSTA PARTICIPANTES, PRESERVANDO POSIÇÕES EXISTENTES
  -- ==========================================================

  delete from public.investment_lot_participants lp
  where lp.lot_id = p_lot_id
    and not exists (
      select 1
      from jsonb_to_recordset(p_participants)
        as x(investor_id uuid, units integer)
      where x.investor_id = lp.investor_id
    );

  insert into public.investment_lot_participants(
    lot_id,
    investor_id,
    purchased_units
  )
  select p_lot_id, x.investor_id, x.units
  from jsonb_to_recordset(p_participants)
    as x(investor_id uuid, units integer)
  on conflict (lot_id, investor_id)
  do update set purchased_units = excluded.purchased_units;

  select coalesce(max(draw_position), 0)::integer
  into v_max_draw
  from public.investment_lot_participants
  where lot_id = p_lot_id;

  for v_row in
    select id
    from public.investment_lot_participants
    where lot_id = p_lot_id
      and draw_position is null
    order by gen_random_uuid()
  loop
    v_max_draw := v_max_draw + 1;
    update public.investment_lot_participants
    set draw_position = v_max_draw
    where id = v_row.id;
  end loop;

  -- ==========================================================
  -- 1C. FILA: MANTÉM O QUE JÁ EXISTE E CORTA SÓ EXCESSOS FUTUROS
  -- ==========================================================

  with sold as (
    select a.investor_id, count(*)::integer as sold_units
    from public.investment_sale_allocations a
    where a.lot_id = p_lot_id
      and a.status = 'active'
    group by a.investor_id
  ), desired as (
    select
      lp.investor_id,
      greatest(0, lp.purchased_units - coalesce(s.sold_units, 0))::integer as desired_pending
    from public.investment_lot_participants lp
    left join sold s on s.investor_id = lp.investor_id
    where lp.lot_id = p_lot_id
  ), ranked as (
    select
      s.id,
      s.investor_id,
      row_number() over (
        partition by s.investor_id
        order by s.slot_number
      )::integer as pending_rank
    from public.investment_distribution_slots s
    where s.lot_id = p_lot_id
      and s.status = 'pending'
  ), excess as (
    select r.id
    from ranked r
    left join desired d on d.investor_id = r.investor_id
    where r.pending_rank > coalesce(d.desired_pending, 0)
  )
  delete from public.investment_distribution_slots s
  using excess e
  where s.id = e.id;

  select coalesce(max(slot_number), 0)::integer
  into v_max_slot
  from public.investment_distribution_slots
  where lot_id = p_lot_id;

  with sold as (
    select a.investor_id, count(*)::integer as sold_units
    from public.investment_sale_allocations a
    where a.lot_id = p_lot_id
      and a.status = 'active'
    group by a.investor_id
  ), pending as (
    select s.investor_id, count(*)::integer as pending_units
    from public.investment_distribution_slots s
    where s.lot_id = p_lot_id
      and s.status = 'pending'
    group by s.investor_id
  )
  select coalesce(max(
    greatest(
      0,
      lp.purchased_units
      - coalesce(s.sold_units, 0)
      - coalesce(p.pending_units, 0)
    )
  ), 0)::integer
  into v_max_extra
  from public.investment_lot_participants lp
  left join sold s on s.investor_id = lp.investor_id
  left join pending p on p.investor_id = lp.investor_id
  where lp.lot_id = p_lot_id;

  if v_max_extra > 0 then
    for v_round in 1..v_max_extra loop
      for v_row in
        with sold as (
          select a.investor_id, count(*)::integer as sold_units
          from public.investment_sale_allocations a
          where a.lot_id = p_lot_id
            and a.status = 'active'
          group by a.investor_id
        ), pending as (
          select s.investor_id, count(*)::integer as pending_units
          from public.investment_distribution_slots s
          where s.lot_id = p_lot_id
            and s.status = 'pending'
          group by s.investor_id
        )
        select
          lp.investor_id,
          lp.draw_position,
          greatest(
            0,
            lp.purchased_units
            - coalesce(s.sold_units, 0)
            - coalesce(p.pending_units, 0)
          )::integer as shortage
        from public.investment_lot_participants lp
        left join sold s on s.investor_id = lp.investor_id
        left join pending p on p.investor_id = lp.investor_id
        where lp.lot_id = p_lot_id
          and greatest(
            0,
            lp.purchased_units
            - coalesce(s.sold_units, 0)
            - coalesce(p.pending_units, 0)
          ) > 0
        order by lp.draw_position
      loop
        v_max_slot := v_max_slot + 1;
        insert into public.investment_distribution_slots(
          lot_id,
          slot_number,
          investor_id,
          draw_position,
          status
        )
        values (
          p_lot_id,
          v_max_slot,
          v_row.investor_id,
          v_row.draw_position,
          'pending'
        );
      end loop;
    end loop;
  end if;

  select count(*)::integer
  into v_active_sales
  from public.investment_sale_allocations a
  where a.lot_id = p_lot_id
    and a.status = 'active';

  update public.investment_lots
  set
    name = v_name,
    total_units = v_participant_total,
    status = case
      when v_active_sales >= v_participant_total then 'completed'
      else 'active'
    end,
    completed_at = case
      when v_active_sales >= v_participant_total then coalesce(completed_at, now())
      else null
    end
  where id = p_lot_id;

  insert into public.investment_events(
    lot_id,
    event_type,
    label,
    metadata,
    actor_user_id,
    actor_email
  )
  values (
    p_lot_id,
    'lot_updated',
    'Lote corrigido pelo administrador',
    jsonb_build_object(
      'old_name', v_lot.name,
      'new_name', v_name,
      'old_total_units', v_old_total,
      'new_total_units', v_participant_total,
      'active_sales_preserved', v_active_sales
    ),
    p_actor_user_id,
    nullif(btrim(coalesce(p_actor_email, '')), '')
  );

  return true;
end;
$$;

-- ============================================================
-- 2. APAGAR LOTE = ARQUIVAR + RETIRAR ESTOQUE NÃO VENDIDO
-- ============================================================

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
  v_row record;
  v_stock integer;
  v_reserved integer;
  v_available_count integer;
begin
  select * into v_lot
  from public.investment_lots
  where id = p_lot_id
  for update;

  if not found then
    raise exception 'Lote não encontrado';
  end if;

  if v_lot.archived_at is not null then
    return false;
  end if;

  -- Primeiro confere todas as reservas. Se uma variação não puder sair,
  -- nada é alterado porque a função inteira roda em uma transação.
  for v_row in
    select iu.variant_id, count(*)::integer as available_count
    from public.inventory_units iu
    where iu.investment_lot_id = p_lot_id
      and iu.status = 'available'
    group by iu.variant_id
  loop
    select pv.stock, coalesce(pv.reserved_stock, 0)
    into v_stock, v_reserved
    from public.product_variants pv
    where pv.id = v_row.variant_id
    for update;

    if not found then
      raise exception 'Variação do lote não encontrada';
    end if;

    if (v_stock - v_reserved) < v_row.available_count then
      raise exception 'Há peça(s) deste lote reservada(s) em pedido. Aguarde a reserva expirar ou finalize/cancele o pedido antes de apagar o lote';
    end if;
  end loop;

  for v_row in
    select iu.variant_id, count(*)::integer as available_count
    from public.inventory_units iu
    where iu.investment_lot_id = p_lot_id
      and iu.status = 'available'
    group by iu.variant_id
  loop
    v_available_count := v_row.available_count;

    update public.product_variants
    set stock = greatest(0, stock - v_available_count)
    where id = v_row.variant_id;

    with changed as (
      update public.inventory_units iu
      set status = 'inactive',
          updated_at = now()
      where iu.investment_lot_id = p_lot_id
        and iu.variant_id = v_row.variant_id
        and iu.status = 'available'
      returning iu.id
    )
    insert into public.inventory_unit_events(
      inventory_unit_id,
      event_type,
      label,
      metadata,
      actor_user_id,
      actor_email
    )
    select
      c.id,
      'investment_lot_archived',
      'Peça retirada porque o lote foi apagado',
      jsonb_build_object('lot_id', p_lot_id),
      p_actor_user_id,
      nullif(btrim(coalesce(p_actor_email, '')), '')
    from changed c;
  end loop;

  delete from public.investment_distribution_slots
  where lot_id = p_lot_id
    and status = 'pending';

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
    lot_id,
    event_type,
    label,
    metadata,
    actor_user_id,
    actor_email
  )
  values (
    p_lot_id,
    'lot_archived',
    'Lote apagado do gerenciamento',
    jsonb_build_object(
      'code', v_lot.code,
      'name', v_lot.name,
      'reason', coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Lote apagado pelo painel administrativo')
    ),
    p_actor_user_id,
    nullif(btrim(coalesce(p_actor_email, '')), '')
  );

  return true;
end;
$$;

-- ============================================================
-- 3. VISÕES: LOTES APAGADOS NÃO APARECEM MAIS NAS TELAS
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
  on after_investor.id = after_slot.investor_id
where l.archived_at is null;

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
join public.investors i on i.id = p.investor_id
join public.investment_lots l on l.id = p.lot_id
where l.archived_at is null;

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
join public.investment_lots l on l.id = s.lot_id
left join public.investment_sale_allocations a
  on a.slot_id = s.id
where l.archived_at is null;

-- ============================================================
-- 4. SEGURANÇA
-- ============================================================

revoke all on function public.update_investment_lot(uuid, text, jsonb, jsonb, uuid, text)
  from public, anon, authenticated;

revoke all on function public.archive_investment_lot(uuid, text, uuid, text)
  from public, anon, authenticated;

grant execute on function public.update_investment_lot(uuid, text, jsonb, jsonb, uuid, text)
  to service_role;

grant execute on function public.archive_investment_lot(uuid, text, uuid, text)
  to service_role;

revoke all on table public.investment_lot_live from public, anon, authenticated;
revoke all on table public.investment_participant_live from public, anon, authenticated;
revoke all on table public.investment_queue_live from public, anon, authenticated;

grant select on table public.investment_lot_live to service_role;
grant select on table public.investment_participant_live to service_role;
grant select on table public.investment_queue_live to service_role;

commit;

select
  'INVESTIDORES ETAPA 4 INSTALADA' as resultado,
  (select count(*) from public.investment_lots where archived_at is null) as lotes_visiveis,
  (select count(*) from public.investment_lots where archived_at is not null) as lotes_apagados;
