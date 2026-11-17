-- A&C Moda — Investidores / Rodízio — Etapa 3
-- Portal separado do investidor + edição/remoção segura no painel administrativo.
-- Execute depois das Etapas 1 e 2.
--
-- IMPORTANTE:
-- - O investidor NÃO vira administrador.
-- - "Remover" significa arquivar/inativar, preservando lotes, vendas e auditoria.
-- - O navegador do investidor não acessa as tabelas diretamente; o portal usa APIs do servidor.

begin;

create extension if not exists citext;

-- ============================================================
-- 1. VÍNCULO ENTRE AUTH.USERS E O INVESTIDOR
-- ============================================================

create table if not exists public.investor_portal_users (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  investor_id uuid not null unique references public.investors(id) on delete cascade,
  email citext not null unique,
  status text not null default 'invited'
    check (status in ('invited', 'active', 'disabled')),
  invited_at timestamptz,
  activated_at timestamptz,
  disabled_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists investor_portal_users_status_idx
  on public.investor_portal_users(status);

create index if not exists investor_portal_users_investor_idx
  on public.investor_portal_users(investor_id);

drop trigger if exists investor_portal_users_set_updated_at
  on public.investor_portal_users;

create trigger investor_portal_users_set_updated_at
before update on public.investor_portal_users
for each row execute function public.set_investment_updated_at();

-- ============================================================
-- 2. EDITAR INVESTIDOR COM AUDITORIA
-- ============================================================

create or replace function public.update_investor(
  p_investor_id uuid,
  p_name text,
  p_email text default null,
  p_phone text default null,
  p_notes text default null,
  p_active boolean default true,
  p_actor_user_id uuid default null,
  p_actor_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_email text;
  v_phone text;
  v_old record;
begin
  if p_investor_id is null then
    raise exception 'Investidor inválido';
  end if;

  select * into v_old
  from public.investors
  where id = p_investor_id
  for update;

  if not found then
    raise exception 'Investidor não encontrado';
  end if;

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

  update public.investors
  set
    name = v_name,
    email = v_email,
    phone = v_phone,
    notes = nullif(btrim(coalesce(p_notes, '')), ''),
    active = coalesce(p_active, true)
  where id = p_investor_id;

  -- Ao inativar, o acesso do portal também é bloqueado imediatamente.
  if coalesce(p_active, true) = false then
    update public.investor_portal_users
    set
      status = 'disabled',
      disabled_at = now()
    where investor_id = p_investor_id
      and status <> 'disabled';
  end if;

  insert into public.investment_events(
    investor_id,
    event_type,
    label,
    metadata,
    actor_user_id,
    actor_email
  )
  values (
    p_investor_id,
    'investor_updated',
    'Investidor atualizado',
    jsonb_build_object(
      'old_name', v_old.name,
      'new_name', v_name,
      'old_email', v_old.email,
      'new_email', v_email,
      'old_active', v_old.active,
      'new_active', coalesce(p_active, true)
    ),
    p_actor_user_id,
    nullif(btrim(coalesce(p_actor_email, '')), '')
  );

  return p_investor_id;
exception
  when unique_violation then
    raise exception 'Já existe um investidor com este e-mail';
end;
$$;

-- ============================================================
-- 3. REMOVER = ARQUIVAR, SEM APAGAR HISTÓRICO
-- ============================================================

create or replace function public.archive_investor(
  p_investor_id uuid,
  p_actor_user_id uuid default null,
  p_actor_email text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_investor record;
begin
  select * into v_investor
  from public.investors
  where id = p_investor_id
  for update;

  if not found then
    raise exception 'Investidor não encontrado';
  end if;

  if v_investor.active = false then
    return false;
  end if;

  update public.investors
  set active = false
  where id = p_investor_id;

  update public.investor_portal_users
  set
    status = 'disabled',
    disabled_at = now()
  where investor_id = p_investor_id
    and status <> 'disabled';

  insert into public.investment_events(
    investor_id,
    event_type,
    label,
    metadata,
    actor_user_id,
    actor_email
  )
  values (
    p_investor_id,
    'investor_archived',
    'Investidor removido dos novos lotes',
    jsonb_build_object('name', v_investor.name, 'code', v_investor.code),
    p_actor_user_id,
    nullif(btrim(coalesce(p_actor_email, '')), '')
  );

  return true;
end;
$$;

-- ============================================================
-- 4. SEGURANÇA
-- ============================================================

alter table public.investor_portal_users enable row level security;

revoke all on table public.investor_portal_users
  from public, anon, authenticated;

grant all on table public.investor_portal_users
  to service_role;

revoke all on function public.update_investor(uuid, text, text, text, text, boolean, uuid, text)
  from public, anon, authenticated;

revoke all on function public.archive_investor(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.update_investor(uuid, text, text, text, text, boolean, uuid, text)
  to service_role;

grant execute on function public.archive_investor(uuid, uuid, text)
  to service_role;

commit;

select
  'INVESTIDORES ETAPA 3 INSTALADA' as resultado,
  (select count(*) from public.investor_portal_users) as acessos_portal,
  (select count(*) from public.investors where active = true) as investidores_ativos;
