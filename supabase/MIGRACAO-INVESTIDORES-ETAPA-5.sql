-- A&C Moda — Investidores / Rodízio — Etapa 5
-- O lote passa a USAR o estoque que já foi cadastrado no produto.
-- Ele não acrescenta estoque novamente.
-- Execute depois das Etapas 1, 2, 3 e 4.
--
-- Fluxo correto:
-- 1) cadastrar/editar o produto e informar o estoque físico real;
-- 2) criar o lote;
-- 3) o lote apenas vincula peças já disponíveis ao rodízio;
-- 4) editar/apagar o lote nunca altera a quantidade física do produto.
--
-- Esta migração também corrige automaticamente lotes antigos ainda sem vendas,
-- criados pelo comportamento anterior que somava estoque na ativação.

begin;

alter table public.investment_lots
  add column if not exists stock_source text;

-- Tudo que já estava ativo antes desta etapa foi criado no modelo antigo,
-- em que o lote somava estoque. Lotes novos usarão catalog_linked.
update public.investment_lots
set stock_source = 'legacy_added'
where stock_source is null
  and archived_at is null
  and status in ('active', 'completed');

update public.investment_lots
set stock_source = 'catalog_linked'
where stock_source is null;

alter table public.investment_lots
  alter column stock_source set default 'catalog_linked';

alter table public.investment_lots
  alter column stock_source set not null;

-- Segurança: o reparo automático só mexe em lotes antigos que ainda não
-- tiveram venda distribuída. Se já houver venda, é melhor revisar manualmente.
do $$
begin
  if exists (
    select 1
    from public.investment_lots l
    where l.stock_source = 'legacy_added'
      and l.archived_at is null
      and exists (
        select 1
        from public.investment_sale_allocations a
        where a.lot_id = l.id
          and a.status = 'active'
      )
  ) then
    raise exception
      'Há lote antigo com venda já distribuída. O reparo automático foi interrompido para preservar o histórico.';
  end if;

  if exists (
    select 1
    from public.investment_lots l
    join public.inventory_units iu on iu.investment_lot_id = l.id
    where l.stock_source = 'legacy_added'
      and l.archived_at is null
      and iu.status in ('sold_store', 'sold_online')
  ) then
    raise exception
      'Há lote antigo com peça já vendida. O reparo automático foi interrompido para preservar o histórico.';
  end if;
end;
$$;

-- Corrige os lotes antigos sem venda:
-- - desativa as unidades duplicadas que o lote criou;
-- - devolve o estoque do produto ao número original;
-- - vincula ao lote as unidades que já existiam no estoque.
do $$
declare
  v_row record;
  v_changed integer;
  v_available integer;
begin
  for v_row in
    select
      li.lot_id,
      li.variant_id,
      li.quantity
    from public.investment_lot_items li
    join public.investment_lots l on l.id = li.lot_id
    where l.stock_source = 'legacy_added'
      and l.archived_at is null
      and l.status in ('active', 'completed')
    order by l.activated_at nulls last, li.created_at, li.id
  loop
    -- As unidades explicitamente criadas pelo lote antigo eram duplicadas.
    with target as (
      select iu.id
      from public.inventory_units iu
      where iu.investment_lot_id = v_row.lot_id
        and iu.variant_id = v_row.variant_id
        and iu.status = 'available'
      order by iu.created_at desc, iu.id desc
      limit v_row.quantity
      for update
    ), changed as (
      update public.inventory_units iu
      set
        status = 'inactive',
        updated_at = now()
      from target t
      where iu.id = t.id
      returning iu.id
    ), logged as (
      insert into public.inventory_unit_events(
        inventory_unit_id,
        event_type,
        label,
        metadata
      )
      select
        c.id,
        'investment_legacy_duplicate_removed',
        'Unidade duplicada do modelo antigo de lote foi desativada',
        jsonb_build_object(
          'lot_id', v_row.lot_id,
          'variant_id', v_row.variant_id
        )
      from changed c
      returning inventory_unit_id
    )
    select count(*)::integer into v_changed
    from logged;

    if v_changed <> v_row.quantity then
      raise exception
        'Não foi possível localizar todas as unidades duplicadas do lote % para a variação %',
        v_row.lot_id, v_row.variant_id;
    end if;

    -- Retira do número de estoque o acréscimo que o lote antigo fez.
    update public.product_variants
    set stock = stock - v_row.quantity
    where id = v_row.variant_id
      and stock >= v_row.quantity;

    if not found then
      raise exception
        'O estoque atual não permite reparar o lote % com segurança',
        v_row.lot_id;
    end if;

    -- Garante que a quantidade de códigos disponíveis volte a acompanhar
    -- o estoque físico. O trigger normalmente já faz isso; esta chamada
    -- também protege instalações em que o trigger esteja desativado.
    perform public.sync_inventory_units_for_variant(v_row.variant_id);

    select count(*)::integer
    into v_available
    from public.inventory_units iu
    where iu.variant_id = v_row.variant_id
      and iu.status = 'available'
      and iu.investment_lot_id is null;

    if v_available < v_row.quantity then
      raise exception
        'Não há peças físicas livres suficientes para converter o lote % sem duplicar estoque. Revise se existem dois lotes usando as mesmas peças.',
        v_row.lot_id;
    end if;

    -- Agora o lote passa a apontar para peças que já existiam no estoque.
    with target as (
      select iu.id
      from public.inventory_units iu
      where iu.variant_id = v_row.variant_id
        and iu.status = 'available'
        and iu.investment_lot_id is null
      order by iu.created_at, iu.id
      limit v_row.quantity
      for update skip locked
    ), changed as (
      update public.inventory_units iu
      set
        investment_lot_id = v_row.lot_id,
        updated_at = now()
      from target t
      where iu.id = t.id
      returning iu.id
    ), logged as (
      insert into public.inventory_unit_events(
        inventory_unit_id,
        event_type,
        label,
        metadata
      )
      select
        c.id,
        'investment_lot_linked_existing_stock',
        'Peça existente vinculada ao lote de investidores',
        jsonb_build_object(
          'lot_id', v_row.lot_id,
          'variant_id', v_row.variant_id,
          'migration', 'etapa_5'
        )
      from changed c
      returning inventory_unit_id
    )
    select count(*)::integer into v_changed
    from logged;

    if v_changed <> v_row.quantity then
      raise exception
        'Falha ao vincular o estoque existente ao lote %',
        v_row.lot_id;
    end if;
  end loop;

  update public.investment_lots
  set stock_source = 'catalog_linked'
  where stock_source = 'legacy_added'
    and archived_at is null;
end;
$$;

-- Estoque livre para entrar em um NOVO lote.
create or replace view public.investment_unassigned_stock as
select
  iu.variant_id,
  count(*)::integer as available_units
from public.inventory_units iu
where iu.status = 'available'
  and iu.investment_lot_id is null
group by iu.variant_id;

revoke all on table public.investment_unassigned_stock
  from public, anon, authenticated;
grant select on table public.investment_unassigned_stock
  to service_role;

-- ============================================================
-- ATIVAÇÃO: SORTEIO ÚNICO + FILA + VÍNCULO COM ESTOQUE EXISTENTE
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
    select 1
    from public.investment_distribution_slots
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

  -- Antes do sorteio, garante que existem peças físicas livres.
  for v_item in
    select variant_id, quantity
    from public.investment_lot_items
    where lot_id = p_lot_id
    order by created_at, id
  loop
    select count(*)::integer
    into v_available
    from public.inventory_units iu
    where iu.variant_id = v_item.variant_id
      and iu.status = 'available'
      and iu.investment_lot_id is null;

    if v_available < v_item.quantity then
      raise exception
        'Estoque livre insuficiente para o lote. Disponível sem outro lote: %, solicitado: %',
        v_available, v_item.quantity;
    end if;
  end loop;

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

  -- NÃO altera product_variants.stock.
  -- Apenas vincula ao lote unidades que já existem no estoque.
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
        updated_at = now()
      from target t
      where iu.id = t.id
      returning iu.id
    ), logged as (
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
        'investment_lot_linked_existing_stock',
        'Peça existente vinculada ao lote de investidores',
        jsonb_build_object('lot_id', p_lot_id),
        p_actor_user_id,
        nullif(btrim(p_actor_email), '')
      from changed c
      returning inventory_unit_id
    )
    select count(*)::integer into v_linked
    from logged;

    if v_linked <> v_item.quantity then
      raise exception 'Não foi possível vincular todas as peças existentes ao lote';
    end if;
  end loop;

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
  )
  values (
    p_lot_id,
    'lot_activated',
    'Lote ativado, ordem sorteada e estoque existente vinculado',
    jsonb_build_object(
      'total_units', v_participant_units,
      'total_slots', v_slot_number,
      'stock_source', 'catalog_linked'
    ),
    p_actor_user_id,
    nullif(btrim(p_actor_email), '')
  );

  return true;
end;
$$;

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
  -- 1A. AJUSTA SOMENTE O VÍNCULO DO LOTE COM O ESTOQUE EXISTENTE
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

      select count(*)::integer
      into v_available_count
      from public.inventory_units iu
      where iu.investment_lot_id = p_lot_id
        and iu.variant_id = v_row.variant_id
        and iu.status = 'available';

      if v_available_count < v_remove_count then
        raise exception
          'Não há peças livres suficientes desta roupa para reduzir a quantidade do lote';
      end if;

      -- A peça continua no estoque físico; apenas deixa de pertencer ao lote.
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
        set
          investment_lot_id = null,
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
        'investment_lot_unlinked',
        'Peça liberada do lote e mantida no estoque',
        jsonb_build_object('lot_id', p_lot_id),
        p_actor_user_id,
        nullif(btrim(coalesce(p_actor_email, '')), '')
      from changed c;

    elsif v_delta > 0 then
      select count(*)::integer
      into v_available_count
      from public.inventory_units iu
      where iu.variant_id = v_row.variant_id
        and iu.status = 'available'
        and iu.investment_lot_id is null;

      if v_available_count < v_delta then
        raise exception
          'Não há peças livres suficientes no estoque para aumentar esta roupa no lote. Livre: %, necessário: %',
          v_available_count, v_delta;
      end if;

      -- A quantidade física já foi cadastrada no produto.
      -- Aqui apenas vinculamos unidades livres ao lote.
      with target as (
        select iu.id
        from public.inventory_units iu
        where iu.variant_id = v_row.variant_id
          and iu.status = 'available'
          and iu.investment_lot_id is null
        order by iu.created_at, iu.id
        limit v_delta
        for update skip locked
      ), changed as (
        update public.inventory_units iu
        set
          investment_lot_id = p_lot_id,
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
        'investment_lot_linked_existing_stock',
        'Peça existente acrescentada ao lote',
        jsonb_build_object('lot_id', p_lot_id),
        p_actor_user_id,
        nullif(btrim(coalesce(p_actor_email, '')), '')
      from changed c;
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
-- 2. APAGAR LOTE = ARQUIVAR + LIBERAR AS PEÇAS PARA O ESTOQUE
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

  -- As peças físicas não são apagadas e o estoque do produto não muda.
  -- Só retiramos o vínculo das unidades ainda disponíveis.
  with changed as (
    update public.inventory_units iu
    set
      investment_lot_id = null,
      updated_at = now()
    where iu.investment_lot_id = p_lot_id
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
    'investment_lot_archived_unlinked',
    'Peça liberada porque o lote foi apagado',
    jsonb_build_object('lot_id', p_lot_id),
    p_actor_user_id,
    nullif(btrim(coalesce(p_actor_email, '')), '')
  from changed c;

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
    'Lote apagado do gerenciamento; peças livres mantidas no estoque',
    jsonb_build_object(
      'code', v_lot.code,
      'name', v_lot.name,
      'reason', coalesce(
        nullif(btrim(coalesce(p_reason, '')), ''),
        'Lote apagado pelo painel administrativo'
      ),
      'stock_was_changed', false
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

revoke all on function public.activate_investment_lot(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.activate_investment_lot(uuid, uuid, text)
  to service_role;

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
  'INVESTIDORES ETAPA 5 INSTALADA' as resultado,
  (select count(*) from public.investment_lots where archived_at is null) as lotes_visiveis,
  (select coalesce(sum(available_units), 0) from public.investment_unassigned_stock) as pecas_livres_para_novos_lotes;