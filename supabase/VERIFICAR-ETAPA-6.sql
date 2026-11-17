select
  'ETAPA 6 OK' as resultado,
  exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'investment_piece_assignments'
  ) as distribuicao_por_peca,
  exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'investor_portal_invites'
  ) as convites_whatsapp,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inventory_units'
      and column_name = 'investment_owner_investor_id'
  ) as dono_da_peca,
  exists (
    select 1 from pg_proc where proname = 'create_and_activate_investment_lot_v2'
  ) as criacao_lote_v2,
  exists (
    select 1 from pg_proc where proname = 'consume_investor_portal_invite'
  ) as convite_uso_unico;
