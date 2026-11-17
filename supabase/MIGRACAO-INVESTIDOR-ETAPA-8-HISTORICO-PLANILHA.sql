-- A&C Moda — Investidor Etapa 8
-- Histórico da planilha no Meu Caixa / Meu Negócio.
-- Requer a Etapa 7 instalada.
-- NÃO importa os dados ainda. Este arquivo cria apenas a estrutura segura.

begin;

do $$
begin
  if to_regclass('public.investor_financial_settings') is null
     or to_regclass('public.investor_cash_transactions') is null then
    raise exception 'A Etapa 7 - Caixa Completo precisa estar instalada antes da Etapa 8.';
  end if;
end $$;

create table if not exists public.investor_financial_legacy_imports (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid not null references public.investors(id) on delete restrict,
  source_name text not null,
  source_version text,
  imported_at timestamptz not null default now(),
  cutover_at timestamptz not null default now(),
  summary jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  unique (investor_id, source_name)
);

create index if not exists investor_financial_legacy_imports_investor_idx
  on public.investor_financial_legacy_imports(investor_id, imported_at desc);

create table if not exists public.investor_financial_legacy_stock (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.investor_financial_legacy_imports(id) on delete cascade,
  investor_id uuid not null references public.investors(id) on delete restrict,
  source_row integer not null,
  item_no text,
  product_name text not null,
  purchase_date date,
  quantity numeric(14,3),
  unit_cost numeric(14,2),
  total_cost numeric(14,2),
  sale_price numeric(14,2),
  profit_per_piece numeric(14,2),
  sale_price_percent numeric(14,4),
  gross_revenue numeric(14,2),
  net_profit numeric(14,2),
  profit_percent numeric(14,4),
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (import_id, source_row)
);

create table if not exists public.investor_financial_legacy_customer_sales (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.investor_financial_legacy_imports(id) on delete cascade,
  investor_id uuid not null references public.investors(id) on delete restrict,
  source_row integer not null,
  sequence_no text,
  client_raw text,
  product_raw text,
  value_raw text,
  obs_raw text,
  amount_numeric numeric(14,2),
  detected_date date,
  status_raw text,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (import_id, source_row)
);

create table if not exists public.investor_financial_legacy_product_sales (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.investor_financial_legacy_imports(id) on delete cascade,
  investor_id uuid not null references public.investors(id) on delete restrict,
  source_row integer not null,
  product_name text not null,
  qty_sold numeric(14,3),
  received numeric(14,2),
  profit numeric(14,2),
  contribution_10pct numeric(14,2),
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (import_id, source_row)
);

create table if not exists public.investor_financial_legacy_expenses (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.investor_financial_legacy_imports(id) on delete cascade,
  investor_id uuid not null references public.investors(id) on delete restrict,
  source_row integer not null,
  sequence_no text,
  description text not null,
  amount numeric(14,2),
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (import_id, source_row)
);

create table if not exists public.investor_financial_legacy_stock_positions (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.investor_financial_legacy_imports(id) on delete cascade,
  investor_id uuid not null references public.investors(id) on delete restrict,
  source_row integer not null,
  sequence_no text,
  product_name text not null,
  qty_total numeric(14,3),
  qty_sold numeric(14,3),
  qty_available numeric(14,3),
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (import_id, source_row)
);

create index if not exists investor_legacy_stock_investor_idx
  on public.investor_financial_legacy_stock(investor_id, source_row);
create index if not exists investor_legacy_customer_sales_investor_idx
  on public.investor_financial_legacy_customer_sales(investor_id, source_row);
create index if not exists investor_legacy_product_sales_investor_idx
  on public.investor_financial_legacy_product_sales(investor_id, source_row);
create index if not exists investor_legacy_expenses_investor_idx
  on public.investor_financial_legacy_expenses(investor_id, source_row);
create index if not exists investor_legacy_stock_positions_investor_idx
  on public.investor_financial_legacy_stock_positions(investor_id, source_row);

alter table public.investor_financial_legacy_imports enable row level security;
alter table public.investor_financial_legacy_stock enable row level security;
alter table public.investor_financial_legacy_customer_sales enable row level security;
alter table public.investor_financial_legacy_product_sales enable row level security;
alter table public.investor_financial_legacy_expenses enable row level security;
alter table public.investor_financial_legacy_stock_positions enable row level security;

revoke all on table public.investor_financial_legacy_imports from public, anon, authenticated;
revoke all on table public.investor_financial_legacy_stock from public, anon, authenticated;
revoke all on table public.investor_financial_legacy_customer_sales from public, anon, authenticated;
revoke all on table public.investor_financial_legacy_product_sales from public, anon, authenticated;
revoke all on table public.investor_financial_legacy_expenses from public, anon, authenticated;
revoke all on table public.investor_financial_legacy_stock_positions from public, anon, authenticated;

grant all on table public.investor_financial_legacy_imports to service_role;
grant all on table public.investor_financial_legacy_stock to service_role;
grant all on table public.investor_financial_legacy_customer_sales to service_role;
grant all on table public.investor_financial_legacy_product_sales to service_role;
grant all on table public.investor_financial_legacy_expenses to service_role;
grant all on table public.investor_financial_legacy_stock_positions to service_role;

commit;

select 'INVESTIDOR ETAPA 8 - HISTÓRICO DA PLANILHA INSTALADO' as resultado;
