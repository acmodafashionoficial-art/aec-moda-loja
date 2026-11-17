-- A&C Moda — Corrigir vínculo do histórico da planilha com o login correto
-- Alvo informado pelo proprietário: digtec21@gmail.com
-- Não duplica dados, não altera estoque, lotes, vendas atuais ou caixa dos outros investidores.
-- Apenas move a importação legada controle de caixa(4).xlsx para o investor_id ligado a este login.

begin;

do $$
declare
  v_email constant text := 'digtec21@gmail.com';
  v_source constant text := 'controle de caixa(4).xlsx';
  v_auth_user_id uuid;
  v_target_investor_id uuid;
  v_target_name text;
  v_target_matches integer;
  v_import_id uuid;
  v_current_investor_id uuid;
  v_import_matches integer;
  v_stock integer := 0;
  v_sales integer := 0;
  v_product_sales integer := 0;
  v_expenses integer := 0;
  v_positions integer := 0;
begin
  if to_regclass('public.investor_financial_legacy_imports') is null then
    raise exception 'A Etapa 8 não está instalada.';
  end if;

  if to_regclass('public.investor_portal_users') is null then
    raise exception 'A estrutura do Portal do Investidor não foi encontrada.';
  end if;

  -- Localiza o login exato no Supabase Auth.
  select count(*), (array_agg(u.id))[1]
    into v_target_matches, v_auth_user_id
  from auth.users u
  where lower(trim(coalesce(u.email, ''))) = lower(trim(v_email));

  if v_target_matches = 0 then
    raise exception 'Não existe usuário de login com o e-mail informado.';
  end if;
  if v_target_matches > 1 then
    raise exception 'Existe mais de um usuário Auth com este e-mail. Nada foi alterado.';
  end if;

  -- Usa o vínculo real login -> investor_id que o portal usa no acesso.
  select count(*), (array_agg(p.investor_id))[1]
    into v_target_matches, v_target_investor_id
  from public.investor_portal_users p
  where p.auth_user_id = v_auth_user_id
    and p.status <> 'disabled';

  if v_target_matches = 0 then
    raise exception 'Este login ainda não está vinculado a um investidor ativo no Portal do Investidor.';
  end if;
  if v_target_matches > 1 then
    raise exception 'Este login está vinculado a mais de um investidor. Nada foi alterado.';
  end if;

  select i.name
    into v_target_name
  from public.investors i
  where i.id = v_target_investor_id
    and i.active = true;

  if v_target_name is null then
    raise exception 'O investidor vinculado a este login não está ativo.';
  end if;

  -- Localiza a única importação feita da planilha.
  select count(*), (array_agg(l.id order by l.imported_at desc))[1],
         (array_agg(l.investor_id order by l.imported_at desc))[1]
    into v_import_matches, v_import_id, v_current_investor_id
  from public.investor_financial_legacy_imports l
  where l.source_name = v_source;

  if v_import_matches = 0 then
    raise exception 'A importação da planilha controle de caixa(4).xlsx não foi encontrada. Nada foi alterado.';
  end if;
  if v_import_matches > 1 then
    raise exception 'Foram encontradas % importações desta planilha. Nada foi alterado para evitar mover dados errados.', v_import_matches;
  end if;

  -- Se já estiver no login certo, não mexe em nada.
  if v_current_investor_id = v_target_investor_id then
    raise notice 'A planilha já está vinculada ao investidor correto: % (%).', v_target_name, v_target_investor_id;
    return;
  end if;

  if exists (
    select 1
    from public.investor_financial_legacy_imports l
    where l.investor_id = v_target_investor_id
      and l.source_name = v_source
      and l.id <> v_import_id
  ) then
    raise exception 'O investidor correto já possui outra importação desta mesma planilha. Nada foi alterado.';
  end if;

  -- Move somente o histórico importado. Nenhum dado operacional da loja é alterado.
  update public.investor_financial_legacy_stock
     set investor_id = v_target_investor_id
   where import_id = v_import_id;
  get diagnostics v_stock = row_count;

  update public.investor_financial_legacy_customer_sales
     set investor_id = v_target_investor_id
   where import_id = v_import_id;
  get diagnostics v_sales = row_count;

  update public.investor_financial_legacy_product_sales
     set investor_id = v_target_investor_id
   where import_id = v_import_id;
  get diagnostics v_product_sales = row_count;

  update public.investor_financial_legacy_expenses
     set investor_id = v_target_investor_id
   where import_id = v_import_id;
  get diagnostics v_expenses = row_count;

  update public.investor_financial_legacy_stock_positions
     set investor_id = v_target_investor_id
   where import_id = v_import_id;
  get diagnostics v_positions = row_count;

  update public.investor_financial_legacy_imports
     set investor_id = v_target_investor_id,
         notes = concat_ws(' ', nullif(trim(coalesce(notes, '')), ''),
           '[Vínculo corrigido para o investor_id do login correto em ' || now()::text || ']')
   where id = v_import_id;

  raise notice 'PLANILHA VINCULADA AO LOGIN CORRETO';
  raise notice 'Investidor: %', v_target_name;
  raise notice 'Investor ID: %', v_target_investor_id;
  raise notice 'Linhas: estoque %, vendas %, resumo produtos %, gastos %, posições %',
    v_stock, v_sales, v_product_sales, v_expenses, v_positions;
end $$;

commit;

-- Conferência final: deve retornar exatamente uma linha e o investidor correto.
select
  i.id as investor_id,
  i.name as investidor,
  l.source_name as planilha,
  l.imported_at
from public.investor_financial_legacy_imports l
join public.investors i on i.id = l.investor_id
where l.source_name = 'controle de caixa(4).xlsx';
