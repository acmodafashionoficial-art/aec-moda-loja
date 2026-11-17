-- A&C Moda — migração da Fase 4.1 para a Fase 5
-- Execute no SQL Editor do Supabase.

create table if not exists public.integration_secrets (
  id text primary key,
  secret jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.integration_secrets enable row level security;

alter table public.orders add column if not exists shipping_status text;
alter table public.orders add column if not exists shipping_tracking text;
alter table public.orders add column if not exists shipping_tracking_url text;
alter table public.orders add column if not exists shipping_label_ids jsonb not null default '[]'::jsonb;

create table if not exists public.shipping_events (
  id text primary key,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);
alter table public.shipping_events enable row level security;
