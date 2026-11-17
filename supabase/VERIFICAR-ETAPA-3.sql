select
  to_regclass('public.investor_portal_users') is not null as tabela_portal,
  to_regprocedure('public.update_investor(uuid,text,text,text,text,boolean,uuid,text)') is not null as funcao_editar,
  to_regprocedure('public.archive_investor(uuid,uuid,text)') is not null as funcao_remover_seguro;

select
  count(*) filter (where ipu.status = 'active') as acessos_ativos,
  count(*) filter (where ipu.status = 'invited') as convites_pendentes,
  count(*) filter (where ipu.status = 'disabled') as acessos_bloqueados
from public.investor_portal_users ipu;
