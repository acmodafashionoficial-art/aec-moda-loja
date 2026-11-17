-- A&C Moda — Fase 8.1: contas individuais, revogação de sessões e 2FA
-- Execute uma única vez no SQL Editor do Supabase, depois da migração da Fase 8.

create extension if not exists citext;

create table if not exists public.admin_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext not null unique,
  display_name text not null check (char_length(display_name) between 2 and 120),
  role text not null default 'admin' check (role in ('owner', 'admin')),
  status text not null default 'invited' check (status in ('invited', 'active', 'disabled')),
  mfa_required boolean not null default true,
  session_version integer not null default 1 check (session_version >= 1),
  invited_by uuid references public.admin_users(id) on delete set null,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_users_status_idx on public.admin_users(status);
create index if not exists admin_users_role_idx on public.admin_users(role, status);
alter table public.admin_users enable row level security;

alter table public.admin_audit_logs
  add column if not exists actor_id uuid references public.admin_users(id) on delete set null;
create index if not exists admin_audit_logs_actor_idx on public.admin_audit_logs(actor_id, created_at desc);

create or replace function public.touch_admin_user_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists admin_users_touch_updated_at on public.admin_users;
create trigger admin_users_touch_updated_at
before update on public.admin_users
for each row execute function public.touch_admin_user_updated_at();

-- O navegador não acessa a tabela administrativa diretamente.
revoke all on public.admin_users from anon, authenticated;
revoke all on public.admin_audit_logs from anon, authenticated;
grant all on public.admin_users to service_role;
grant all on public.admin_audit_logs to service_role;
revoke execute on function public.touch_admin_user_updated_at() from public, anon, authenticated;
grant execute on function public.touch_admin_user_updated_at() to service_role;
