select
  'ETAPA 4 OK' as resultado,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'investment_lots'
      and column_name = 'archived_at'
  ) as coluna_arquivamento,
  to_regprocedure('public.update_investment_lot(uuid,text,jsonb,jsonb,uuid,text)') is not null as editar_lote,
  to_regprocedure('public.archive_investment_lot(uuid,text,uuid,text)') is not null as apagar_lote;
