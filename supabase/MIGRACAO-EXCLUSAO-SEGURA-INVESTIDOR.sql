-- A&C Moda — correção: exclusão segura de investidor
-- Permite apagar definitivamente somente cadastros ainda sem histórico operacional.
-- Investidores que já participaram de lote, venda, peça atribuída ou caixa devem ser arquivados.

begin;

create or replace function public.delete_unused_investor(
  p_investor_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exists boolean;
  v_has_history boolean := false;
begin
  if p_investor_id is null then
    return 'not_found';
  end if;

  select exists(
    select 1
    from public.investors
    where id = p_investor_id
    for update
  )
  into v_exists;

  if not v_exists then
    return 'not_found';
  end if;

  -- Histórico principal de lotes/rodízio.
  if exists (
    select 1 from public.investment_lot_participants
    where investor_id = p_investor_id
  ) then
    v_has_history := true;
  end if;

  if not v_has_history and exists (
    select 1 from public.investment_distribution_slots
    where investor_id = p_investor_id
  ) then
    v_has_history := true;
  end if;

  if not v_has_history and exists (
    select 1 from public.investment_sale_allocations
    where investor_id = p_investor_id
  ) then
    v_has_history := true;
  end if;

  -- Etapa 6: dono definido por peça.
  if not v_has_history
     and to_regclass('public.investment_piece_assignments') is not null then
    execute
      'select exists(select 1 from public.investment_piece_assignments where investor_id = $1)'
      into v_exists
      using p_investor_id;
    if v_exists then
      v_has_history := true;
    end if;
  end if;

  -- Etapa 6: peça física já vinculada diretamente a um investidor.
  if not v_has_history
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'inventory_units'
         and column_name = 'investment_owner_investor_id'
     ) then
    execute
      'select exists(select 1 from public.inventory_units where investment_owner_investor_id = $1)'
      into v_exists
      using p_investor_id;
    if v_exists then
      v_has_history := true;
    end if;
  end if;

  -- Etapa 7: vendas, movimentações manuais e auditoria financeira contam como histórico.
  if not v_has_history
     and to_regclass('public.investor_financial_sale_entries') is not null then
    execute
      'select exists(select 1 from public.investor_financial_sale_entries where investor_id = $1)'
      into v_exists
      using p_investor_id;
    if v_exists then
      v_has_history := true;
    end if;
  end if;

  if not v_has_history
     and to_regclass('public.investor_cash_transactions') is not null then
    execute
      'select exists(select 1 from public.investor_cash_transactions where investor_id = $1)'
      into v_exists
      using p_investor_id;
    if v_exists then
      v_has_history := true;
    end if;
  end if;

  if not v_has_history
     and to_regclass('public.investor_financial_audit') is not null then
    execute
      'select exists(select 1 from public.investor_financial_audit where investor_id = $1)'
      into v_exists
      using p_investor_id;
    if v_exists then
      v_has_history := true;
    end if;
  end if;

  if v_has_history then
    return 'has_history';
  end if;

  -- Sem histórico operacional: configurações temporárias podem ser apagadas junto.
  if to_regclass('public.investor_financial_product_costs') is not null then
    execute
      'delete from public.investor_financial_product_costs where investor_id = $1'
      using p_investor_id;
  end if;

  if to_regclass('public.investor_financial_settings') is not null then
    execute
      'delete from public.investor_financial_settings where investor_id = $1'
      using p_investor_id;
  end if;

  -- Eventos administrativos (cadastro/edição/arquivamento) não bloqueiam a exclusão
  -- quando nunca houve uso real do investidor.
  delete from public.investment_events
  where investor_id = p_investor_id;

  -- investor_portal_users e investor_portal_invites usam ON DELETE CASCADE.
  delete from public.investors
  where id = p_investor_id;

  if not found then
    return 'not_found';
  end if;

  return 'deleted';
end;
$$;

revoke all on function public.delete_unused_investor(uuid)
  from public, anon, authenticated;

grant execute on function public.delete_unused_investor(uuid)
  to service_role;

commit;

select
  'EXCLUSÃO SEGURA DE INVESTIDOR INSTALADA' as resultado;
