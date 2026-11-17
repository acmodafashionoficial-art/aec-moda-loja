-- A&C Moda — Fase 8: endurecimento de segurança
-- Execute uma única vez no SQL Editor do Supabase.

create extension if not exists pgcrypto;

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor text not null default 'admin',
  action text not null,
  resource_type text,
  resource_id text,
  outcome text not null default 'success' check (outcome in ('success', 'failure')),
  ip_hash text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_logs_created_idx on public.admin_audit_logs(created_at desc);
create index if not exists admin_audit_logs_action_idx on public.admin_audit_logs(action, created_at desc);
alter table public.admin_audit_logs enable row level security;

create table if not exists public.api_rate_limits (
  key text primary key,
  window_started_at timestamptz not null default now(),
  hits integer not null default 0 check (hits >= 0),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists api_rate_limits_updated_idx on public.api_rate_limits(updated_at);
alter table public.api_rate_limits enable row level security;

create or replace function public.check_api_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer,
  p_block_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_row public.api_rate_limits%rowtype;
  v_retry integer := 0;
begin
  if p_key is null or length(p_key) < 8 or length(p_key) > 300 then
    raise exception 'Chave de limite inválida';
  end if;
  p_limit := greatest(1, least(p_limit, 10000));
  p_window_seconds := greatest(1, least(p_window_seconds, 86400));
  p_block_seconds := greatest(1, least(p_block_seconds, 604800));

  insert into public.api_rate_limits(key, window_started_at, hits, blocked_until, updated_at)
  values (p_key, v_now, 0, null, v_now)
  on conflict (key) do nothing;

  select * into v_row from public.api_rate_limits where key = p_key for update;

  if v_row.blocked_until is not null and v_row.blocked_until > v_now then
    v_retry := greatest(1, ceil(extract(epoch from (v_row.blocked_until - v_now)))::integer);
    return jsonb_build_object('allowed', false, 'remaining', 0, 'retry_after', v_retry);
  end if;

  if v_row.window_started_at + make_interval(secs => p_window_seconds) <= v_now then
    update public.api_rate_limits set window_started_at = v_now, hits = 1, blocked_until = null, updated_at = v_now where key = p_key;
    return jsonb_build_object('allowed', true, 'remaining', p_limit - 1, 'retry_after', 0);
  end if;

  if v_row.hits + 1 > p_limit then
    update public.api_rate_limits set hits = hits + 1, blocked_until = v_now + make_interval(secs => p_block_seconds), updated_at = v_now where key = p_key;
    return jsonb_build_object('allowed', false, 'remaining', 0, 'retry_after', p_block_seconds);
  end if;

  update public.api_rate_limits set hits = hits + 1, updated_at = v_now where key = p_key;
  return jsonb_build_object('allowed', true, 'remaining', greatest(0, p_limit - (v_row.hits + 1)), 'retry_after', 0);
end;
$$;

-- A aplicação acessa o banco exclusivamente pelo servidor com a chave secreta.
-- Nenhum navegador recebe acesso direto às tabelas ou funções sensíveis.
revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;

-- Remove políticas públicas antigas, pois a vitrine também consulta pelo servidor.
drop policy if exists "Produtos ativos são públicos" on public.products;
drop policy if exists "Variações ativas são públicas" on public.product_variants;

-- Reforça RLS em todas as tabelas sensíveis existentes.
alter table if exists public.products enable row level security;
alter table if exists public.product_variants enable row level security;
alter table if exists public.orders enable row level security;
alter table if exists public.store_settings enable row level security;
alter table if exists public.payment_settings enable row level security;
alter table if exists public.integration_secrets enable row level security;
alter table if exists public.shipping_events enable row level security;
alter table if exists public.order_events enable row level security;
alter table if exists public.order_reservations enable row level security;

-- Buckets públicos continuam permitindo visualizar as imagens tratadas, mas uploads
-- são feitos apenas pelo servidor. SVG e arquivos arbitrários não são aceitos.
update storage.buckets
set file_size_limit = 8388608,
    allowed_mime_types = array['image/webp']::text[]
where id in ('product-images', 'brand-assets');

-- Limpeza automática opcional de contadores antigos.
create or replace function public.cleanup_api_rate_limits()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  delete from public.api_rate_limits
  where updated_at < now() - interval '7 days'
    and (blocked_until is null or blocked_until < now());
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.cleanup_api_rate_limits() from public, anon, authenticated;
grant execute on function public.cleanup_api_rate_limits() to service_role;
revoke execute on function public.check_api_rate_limit(text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.check_api_rate_limit(text, integer, integer, integer) to service_role;
