-- A&C Moda — Investidores / Rodízio — Etapa 2
-- Interface administrativa segura: criação de investidores e criação+ativação
-- atômica de lotes compartilhados.
--
-- Execute este arquivo inteiro no SQL Editor do Supabase depois da Etapa 1.

begin;

-- ============================================================
-- 1. CRIAR INVESTIDOR COM AUDITORIA
-- ============================================================

create or replace function public.create_investor(
  p_name text,
  p_email text default null,
  p_phone text default null,
  p_notes text default null,
  p_actor_user_id uuid default null,
  p_actor_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text;
  v_email text;
  v_phone text;
begin
  v_name := btrim(coalesce(p_name, ''));
  v_email := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_phone := nullif(btrim(coalesce(p_phone, '')), '');

  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Informe um nome de investidor válido';
  end if;

  if v_email is not null and char_length(v_email) > 200 then
    raise exception 'E-mail do investidor inválido';
  end if;

  if v_phone is not null and char_length(v_phone) > 40 then
    raise exception 'Telefone do investidor inválido';
  end if;

  insert into public.investors(
    name,
    email,
    phone,
    notes,
    active
  )
  values (
    v_name,
    v_email,
    v_phone,
    nullif(btrim(coalesce(p_notes, '')), ''),
    true
  )
  returning id into v_id;

  insert into public.investment_events(
    investor_id,
    event_type,
    label,
    metadata,
    actor_user_id,
    actor_email
  )
  values (
    v_id,
    'investor_created',
    'Investidor cadastrado',
    jsonb_build_object(
      'name', v_name,
      'email', v_email,
      'phone', v_phone
    ),
    p_actor_user_id,
    nullif(btrim(coalesce(p_actor_email, '')), '')
  );

  return v_id;
exception
  when unique_violation then
    raise exception 'Já existe um investidor com este e-mail';
end;
$$;

-- ============================================================
-- 2. CRIAR + SORTEAR + ATIVAR LOTE EM UMA ÚNICA TRANSAÇÃO
-- ============================================================

create or replace function public.create_and_activate_investment_lot(
  p_name text,
  p_participants jsonb,
  p_items jsonb,
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
  v_participant record;
  v_item record;
  v_participant_count integer := 0;
  v_item_count integer := 0;
begin
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

  insert into public.investment_lots(
    name,
    status,
    distribution_rule,
    created_by_user_id,
    created_by_email
  )
  values (
    v_name,
    'draft',
    'round_robin_random',
    p_actor_user_id,
    nullif(btrim(coalesce(p_actor_email, '')), '')
  )
  returning id into v_lot_id;

  for v_participant in
    select *
    from jsonb_to_recordset(p_participants)
      as x(investor_id uuid, units integer)
  loop
    if v_participant.investor_id is null then
      raise exception 'Investidor inválido no lote';
    end if;

    if v_participant.units is null
       or v_participant.units < 1
       or v_participant.units > 10000 then
      raise exception 'Quantidade inválida para um investidor';
    end if;

    if not exists (
      select 1
      from public.investors
      where id = v_participant.investor_id
        and active = true
    ) then
      raise exception 'Um dos investidores não existe ou está inativo';
    end if;

    insert into public.investment_lot_participants(
      lot_id,
      investor_id,
      purchased_units
    )
    values (
      v_lot_id,
      v_participant.investor_id,
      v_participant.units
    );

    v_participant_count := v_participant_count + 1;
  end loop;

  if v_participant_count <> jsonb_array_length(p_participants) then
    raise exception 'Falha ao validar os investidores do lote';
  end if;

  for v_item in
    select *
    from jsonb_to_recordset(p_items)
      as x(variant_id uuid, quantity integer)
  loop
    if v_item.variant_id is null then
      raise exception 'Variação inválida no lote';
    end if;

    if v_item.quantity is null
       or v_item.quantity < 1
       or v_item.quantity > 10000 then
      raise exception 'Quantidade inválida para uma peça';
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

    insert into public.investment_lot_items(
      lot_id,
      variant_id,
      quantity
    )
    values (
      v_lot_id,
      v_item.variant_id,
      v_item.quantity
    );

    v_item_count := v_item_count + 1;
  end loop;

  if v_item_count <> jsonb_array_length(p_items) then
    raise exception 'Falha ao validar as peças do lote';
  end if;

  -- Esta chamada faz o sorteio único, grava toda a sequência e adiciona
  -- o novo estoque. Se QUALQUER validação falhar, toda esta função é revertida.
  perform public.activate_investment_lot(
    v_lot_id,
    p_actor_user_id,
    p_actor_email
  );

  return v_lot_id;
exception
  when unique_violation then
    raise exception 'Há investidor ou variação repetida no lote';
end;
$$;

-- ============================================================
-- 3. SEGURANÇA
-- ============================================================

revoke all on function public.create_investor(text, text, text, text, uuid, text)
  from public, anon, authenticated;

revoke all on function public.create_and_activate_investment_lot(text, jsonb, jsonb, uuid, text)
  from public, anon, authenticated;

grant execute on function public.create_investor(text, text, text, text, uuid, text)
  to service_role;

grant execute on function public.create_and_activate_investment_lot(text, jsonb, jsonb, uuid, text)
  to service_role;

commit;

select
  'INVESTIDORES ETAPA 2 INSTALADA' as resultado,
  (select count(*) from public.investors) as investidores,
  (select count(*) from public.investment_lots) as lotes;
