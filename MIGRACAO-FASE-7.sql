-- A&C Moda — Fase 7: InfinitePay
-- Execute uma vez no SQL Editor do Supabase após a Fase 6/6.1.

create table if not exists public.payment_settings (
  id text primary key,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.payment_settings (id, settings)
values ('main', jsonb_build_object(
  'provider', 'infinitepay',
  'checkoutEnabled', false,
  'infinitePayHandle', '',
  'displayName', 'InfinitePay',
  'showPix', true,
  'showCreditCard', true,
  'maxInstallments', 12
))
on conflict (id) do nothing;

alter table public.payment_settings enable row level security;
revoke all on table public.payment_settings from public, anon, authenticated;
grant all on table public.payment_settings to service_role;

alter table public.orders add column if not exists payment_provider text;
alter table public.orders add column if not exists payment_receipt_url text;
alter table public.orders add column if not exists payment_method text;
alter table public.orders add column if not exists payment_installments integer;
alter table public.orders add column if not exists paid_amount numeric(12,2);

create index if not exists orders_payment_provider_idx on public.orders(payment_provider);
create index if not exists orders_payment_id_idx on public.orders(payment_id);
