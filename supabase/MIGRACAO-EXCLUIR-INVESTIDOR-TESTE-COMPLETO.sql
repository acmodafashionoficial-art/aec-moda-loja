-- A&C Moda — exclusão TOTAL de investidor de teste
--
-- Objetivo:
-- permitir apagar completamente um cadastro usado em TESTES, mesmo que ele já
-- tenha participado de lote, desde que os lotes relacionados NÃO tenham venda.
--
-- Segurança:
-- - se existir venda/alocação de venda em qualquer lote relacionado, a operação
--   é bloqueada;
-- - ao apagar um investidor de teste, os lotes relacionados a ele também são
--   apagados por completo para não deixar rodízio inconsistente;
-- - as peças físicas apenas são DESVINCULADAS desses lotes. O estoque do produto
--   não é aumentado nem reduzido;
-- - pedidos/vendas reais nunca são apagados por esta função.

begin;

create or replace function public.purge_test_investor(
  p_investor_id uuid,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exists boolean;
  v_lot_ids uuid[] := array[]::uuid[];
  v_lots_deleted integer := 0;
  v_other_participants integer := 0;
begin
  if coalesce(btrim(p_confirmation), '') <> 'APAGAR TESTE' then
    raise exception 'Confirmação inválida para exclusão total do teste';
  end if;

  select exists(
    select 1
    from public.investors
    where id = p_investor_id
    for update
  ) into v_exists;

  if not v_exists then
    return jsonb_build_object('status', 'not_found', 'lots_deleted', 0);
  end if;

  -- Localiza todo lote em que este cadastro apareceu.
  select coalesce(array_agg(distinct x.lot_id), array[]::uuid[])
  into v_lot_ids
  from (
    select lot_id
    from public.investment_lot_participants
    where investor_id = p_investor_id

    union

    select lot_id
    from public.investment_distribution_slots
    where investor_id = p_investor_id

    union

    select lot_id
    from public.investment_sale_allocations
    where investor_id = p_investor_id

    union

    select lot_id
    from public.investment_events
    where investor_id = p_investor_id
      and lot_id is not null
  ) x
  where x.lot_id is not null;

  -- Etapa 6: inclui lotes por distribuição definida por peça.
  if to_regclass('public.investment_piece_assignments') is not null then
    execute $q$
      select array(
        select distinct lot_id
        from (
          select unnest($1::uuid[]) as lot_id
          union
          select lot_id
          from public.investment_piece_assignments
          where investor_id = $2
        ) z
        where lot_id is not null
      )
    $q$
    into v_lot_ids
    using v_lot_ids, p_investor_id;
  end if;

  -- Etapa 6: inclui lote vinculado diretamente à peça física.
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'inventory_units'
      and column_name = 'investment_owner_investor_id'
  ) then
    execute $q$
      select array(
        select distinct lot_id
        from (
          select unnest($1::uuid[]) as lot_id
          union
          select investment_lot_id as lot_id
          from public.inventory_units
          where investment_owner_investor_id = $2
            and investment_lot_id is not null
        ) z
        where lot_id is not null
      )
    $q$
    into v_lot_ids
    using v_lot_ids, p_investor_id;
  end if;

  -- Não apaga teste que já atingiu uma venda. Primeiro a venda precisa ser
  -- cancelada pelo fluxo normal, para estoque/pedido permanecerem corretos.
  if cardinality(v_lot_ids) > 0 then
    if exists (
      select 1
      from public.investment_sale_allocations a
      where a.lot_id = any(v_lot_ids)
    ) then
      return jsonb_build_object(
        'status', 'blocked_sales',
        'lots_deleted', 0,
        'message', 'Existe venda distribuída em um dos lotes deste investidor.'
      );
    end if;

    if exists (
      select 1
      from public.inventory_units iu
      where iu.investment_lot_id = any(v_lot_ids)
        and iu.status in ('sold_store', 'sold_online')
    ) then
      return jsonb_build_object(
        'status', 'blocked_sales',
        'lots_deleted', 0,
        'message', 'Existe peça vendida em um dos lotes deste investidor.'
      );
    end if;
  end if;

  if cardinality(v_lot_ids) > 0 then
    select count(*)::integer
    into v_other_participants
    from public.investment_lot_participants p
    where p.lot_id = any(v_lot_ids)
      and p.investor_id <> p_investor_id;

    -- Coloca o lote em estado não travado antes das limpezas. Isso permite
    -- remover ordem manual/distribuição por peça sem burlar histórico de venda,
    -- pois a função já bloqueou qualquer lote que tenha venda.
    update public.investment_lots
    set status = 'cancelled'
    where id = any(v_lot_ids);

    -- Etapa 7 (se já estiver instalada): apaga somente o financeiro de teste
    -- relacionado aos lotes que serão removidos.
    if to_regclass('public.investor_financial_sale_entries') is not null then
      execute 'delete from public.investor_financial_sale_entries where lot_id = any($1) or investor_id = $2'
      using v_lot_ids, p_investor_id;
    end if;

    if to_regclass('public.investor_cash_transactions') is not null then
      execute 'delete from public.investor_cash_transactions where lot_id = any($1) or investor_id = $2'
      using v_lot_ids, p_investor_id;
    end if;

    if to_regclass('public.investor_financial_product_costs') is not null then
      execute 'delete from public.investor_financial_product_costs where lot_id = any($1) or investor_id = $2'
      using v_lot_ids, p_investor_id;
    end if;

    -- Libera as peças para poderem entrar em outro lote. Não altera estoque.
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'inventory_units'
        and column_name = 'investment_owner_investor_id'
    ) then
      execute $q$
        update public.inventory_units
        set investment_lot_id = null,
            investment_owner_investor_id = null,
            updated_at = now()
        where investment_lot_id = any($1)
           or investment_owner_investor_id = $2
      $q$
      using v_lot_ids, p_investor_id;
    else
      update public.inventory_units
      set investment_lot_id = null,
          updated_at = now()
      where investment_lot_id = any(v_lot_ids);
    end if;

    -- Remove eventos antes do lote porque a FK é RESTRICT.
    delete from public.investment_events
    where lot_id = any(v_lot_ids)
       or investor_id = p_investor_id;

    -- Não deveria haver alocações porque foram bloqueadas acima; esta limpeza
    -- cobre instalações de teste antigas em que existam linhas sem venda física.
    delete from public.investment_sale_allocations
    where lot_id = any(v_lot_ids)
       or investor_id = p_investor_id;

    -- Evita a FK própria replacement_for_slot_id impedir a limpeza.
    update public.investment_distribution_slots
    set replacement_for_slot_id = null
    where lot_id = any(v_lot_ids);

    delete from public.investment_distribution_slots
    where lot_id = any(v_lot_ids);

    if to_regclass('public.investment_piece_assignments') is not null then
      execute 'delete from public.investment_piece_assignments where lot_id = any($1) or investor_id = $2'
      using v_lot_ids, p_investor_id;
    end if;

    delete from public.investment_lot_participants
    where lot_id = any(v_lot_ids)
       or investor_id = p_investor_id;

    -- Itens são cascade, mas apagar explicitamente deixa a operação previsível.
    delete from public.investment_lot_items
    where lot_id = any(v_lot_ids);

    delete from public.investment_lots
    where id = any(v_lot_ids);

    get diagnostics v_lots_deleted = row_count;
  else
    -- Mesmo sem lote, limpa referências diretas residuais.
    delete from public.investment_events
    where investor_id = p_investor_id;

    delete from public.investment_distribution_slots
    where investor_id = p_investor_id;

    if to_regclass('public.investment_piece_assignments') is not null then
      execute 'delete from public.investment_piece_assignments where investor_id = $1'
      using p_investor_id;
    end if;

    delete from public.investment_lot_participants
    where investor_id = p_investor_id;
  end if;

  -- Financeiro próprio sem lote.
  if to_regclass('public.investor_financial_audit') is not null then
    execute 'delete from public.investor_financial_audit where investor_id = $1'
    using p_investor_id;
  end if;

  if to_regclass('public.investor_cash_transactions') is not null then
    execute 'delete from public.investor_cash_transactions where investor_id = $1'
    using p_investor_id;
  end if;

  if to_regclass('public.investor_financial_sale_entries') is not null then
    execute 'delete from public.investor_financial_sale_entries where investor_id = $1'
    using p_investor_id;
  end if;

  if to_regclass('public.investor_financial_product_costs') is not null then
    execute 'delete from public.investor_financial_product_costs where investor_id = $1'
    using p_investor_id;
  end if;

  if to_regclass('public.investor_financial_settings') is not null then
    execute 'delete from public.investor_financial_settings where investor_id = $1'
    using p_investor_id;
  end if;

  -- Convites e vínculo do portal usam ON DELETE CASCADE com investors.
  delete from public.investors
  where id = p_investor_id;

  if not found then
    return jsonb_build_object('status', 'not_found', 'lots_deleted', 0);
  end if;

  return jsonb_build_object(
    'status', 'deleted',
    'lots_deleted', v_lots_deleted,
    'other_participants_removed_from_test_lots', v_other_participants
  );
end;
$$;

revoke all on function public.purge_test_investor(uuid, text)
  from public, anon, authenticated;

grant execute on function public.purge_test_investor(uuid, text)
  to service_role;

commit;

select 'EXCLUSÃO TOTAL DE INVESTIDOR DE TESTE INSTALADA' as resultado;
