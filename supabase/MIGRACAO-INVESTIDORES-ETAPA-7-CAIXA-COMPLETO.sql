-- A&C Moda — Investidores Etapa 7
-- Caixa completo do investidor: vendas automáticas + ajustes manuais + entradas/despesas/investimentos/retiradas.
-- Execute inteiro no SQL Editor do Supabase depois da Etapa 6.

begin;

create table if not exists public.investor_financial_settings (
  investor_id uuid primary key references public.investors(id) on delete restrict,
  opening_balance numeric(14,2) not null default 0,
  default_discount_mode text not null default 'none'
    check (default_discount_mode in ('none','percent','fixed')),
  default_discount_value numeric(14,4) not null default 0 check (default_discount_value >= 0),
  default_payment_fee_mode text not null default 'none'
    check (default_payment_fee_mode in ('none','percent','fixed')),
  default_payment_fee_value numeric(14,4) not null default 0 check (default_payment_fee_value >= 0),
  default_store_fee_mode text not null default 'none'
    check (default_store_fee_mode in ('none','percent','fixed')),
  default_store_fee_value numeric(14,4) not null default 0 check (default_store_fee_value >= 0),
  default_extra_deduction_mode text not null default 'none'
    check (default_extra_deduction_mode in ('none','percent','fixed')),
  default_extra_deduction_value numeric(14,4) not null default 0 check (default_extra_deduction_value >= 0),
  reinvestment_percent numeric(7,4) not null default 0
    check (reinvestment_percent >= 0 and reinvestment_percent <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.investor_financial_product_costs (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid not null references public.investors(id) on delete restrict,
  lot_id uuid not null references public.investment_lots(id) on delete restrict,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  unit_cost numeric(14,2) not null default 0 check (unit_cost >= 0),
  planned_price numeric(14,2) check (planned_price is null or planned_price >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (investor_id, lot_id, variant_id)
);

create index if not exists investor_financial_product_costs_investor_idx
  on public.investor_financial_product_costs(investor_id, lot_id);

create table if not exists public.investor_financial_sale_entries (
  id uuid primary key default gen_random_uuid(),
  allocation_id uuid not null unique references public.investment_sale_allocations(id) on delete restrict,
  investor_id uuid not null references public.investors(id) on delete restrict,
  lot_id uuid not null references public.investment_lots(id) on delete restrict,
  inventory_unit_id uuid not null references public.inventory_units(id) on delete restrict,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  source_type text not null check (source_type in ('store_sale','online_order')),
  gross_amount numeric(14,2) not null default 0 check (gross_amount >= 0),
  gross_amount_override numeric(14,2) check (gross_amount_override is null or gross_amount_override >= 0),
  sale_status text not null default 'active' check (sale_status in ('active','reversed')),
  sold_at timestamptz not null default now(),

  discount_mode text not null default 'none' check (discount_mode in ('none','percent','fixed')),
  discount_value numeric(14,4) not null default 0 check (discount_value >= 0),
  payment_fee_mode text not null default 'none' check (payment_fee_mode in ('none','percent','fixed')),
  payment_fee_value numeric(14,4) not null default 0 check (payment_fee_value >= 0),
  store_fee_mode text not null default 'none' check (store_fee_mode in ('none','percent','fixed')),
  store_fee_value numeric(14,4) not null default 0 check (store_fee_value >= 0),
  extra_deduction_mode text not null default 'none' check (extra_deduction_mode in ('none','percent','fixed')),
  extra_deduction_value numeric(14,4) not null default 0 check (extra_deduction_value >= 0),

  unit_cost numeric(14,2) not null default 0 check (unit_cost >= 0),
  net_received_override numeric(14,2) check (net_received_override is null or net_received_override >= 0),
  notes text,
  updated_at timestamptz not null default now()
);

create index if not exists investor_financial_sales_investor_date_idx
  on public.investor_financial_sale_entries(investor_id, sold_at desc);
create index if not exists investor_financial_sales_lot_idx
  on public.investor_financial_sale_entries(lot_id, investor_id);
create index if not exists investor_financial_sales_variant_idx
  on public.investor_financial_sale_entries(investor_id, lot_id, variant_id);

create table if not exists public.investor_cash_transactions (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid not null references public.investors(id) on delete restrict,
  lot_id uuid references public.investment_lots(id) on delete restrict,
  variant_id uuid references public.product_variants(id) on delete restrict,
  kind text not null check (kind in ('income','expense','investment','withdrawal')),
  category text not null default 'Outros',
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  occurred_on date not null default current_date,
  payment_method text,
  notes text,
  status text not null default 'active' check (status in ('active','voided')),
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists investor_cash_transactions_investor_date_idx
  on public.investor_cash_transactions(investor_id, occurred_on desc, created_at desc);

create table if not exists public.investor_financial_audit (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid not null references public.investors(id) on delete restrict,
  auth_user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists investor_financial_audit_investor_idx
  on public.investor_financial_audit(investor_id, created_at desc);

-- Atualização automática do updated_at.
drop trigger if exists investor_financial_settings_set_updated_at on public.investor_financial_settings;
create trigger investor_financial_settings_set_updated_at
before update on public.investor_financial_settings
for each row execute function public.set_updated_at();

drop trigger if exists investor_financial_product_costs_set_updated_at on public.investor_financial_product_costs;
create trigger investor_financial_product_costs_set_updated_at
before update on public.investor_financial_product_costs
for each row execute function public.set_updated_at();

drop trigger if exists investor_financial_sales_set_updated_at on public.investor_financial_sale_entries;
create trigger investor_financial_sales_set_updated_at
before update on public.investor_financial_sale_entries
for each row execute function public.set_updated_at();

drop trigger if exists investor_cash_transactions_set_updated_at on public.investor_cash_transactions;
create trigger investor_cash_transactions_set_updated_at
before update on public.investor_cash_transactions
for each row execute function public.set_updated_at();

-- Calcula uma dedução em percentual ou valor fixo.
create or replace function public.investor_financial_rule_amount(
  p_base numeric,
  p_mode text,
  p_value numeric
)
returns numeric
language sql
immutable
set search_path = public
as $$
  select round(
    greatest(0, least(
      greatest(0, coalesce(p_base, 0)),
      case coalesce(p_mode, 'none')
        when 'percent' then greatest(0, coalesce(p_base, 0)) * least(100, greatest(0, coalesce(p_value, 0))) / 100
        when 'fixed' then greatest(0, coalesce(p_value, 0))
        else 0
      end
    )), 2
  );
$$;

-- Snapshot financeiro automático no momento da distribuição da venda.
create or replace function public.sync_investor_financial_sale_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_variant_id uuid;
  v_discount_mode text;
  v_discount_value numeric;
  v_payment_mode text;
  v_payment_value numeric;
  v_store_mode text;
  v_store_value numeric;
  v_extra_mode text;
  v_extra_value numeric;
  v_unit_cost numeric;
begin
  select variant_id into v_variant_id
  from public.inventory_units
  where id = new.inventory_unit_id;

  if v_variant_id is null then
    raise exception 'Variação da peça da venda não encontrada';
  end if;

  select
    coalesce(max(default_discount_mode), 'none'),
    coalesce(max(default_discount_value), 0),
    coalesce(max(default_payment_fee_mode), 'none'),
    coalesce(max(default_payment_fee_value), 0),
    coalesce(max(default_store_fee_mode), 'none'),
    coalesce(max(default_store_fee_value), 0),
    coalesce(max(default_extra_deduction_mode), 'none'),
    coalesce(max(default_extra_deduction_value), 0)
  into
    v_discount_mode, v_discount_value,
    v_payment_mode, v_payment_value,
    v_store_mode, v_store_value,
    v_extra_mode, v_extra_value
  from public.investor_financial_settings
  where investor_id = new.investor_id;

  select coalesce(max(unit_cost), 0)
  into v_unit_cost
  from public.investor_financial_product_costs
  where investor_id = new.investor_id
    and lot_id = new.lot_id
    and variant_id = v_variant_id;

  insert into public.investor_financial_sale_entries(
    allocation_id, investor_id, lot_id, inventory_unit_id, variant_id,
    source_type, gross_amount, sale_status, sold_at,
    discount_mode, discount_value,
    payment_fee_mode, payment_fee_value,
    store_fee_mode, store_fee_value,
    extra_deduction_mode, extra_deduction_value,
    unit_cost
  ) values (
    new.id, new.investor_id, new.lot_id, new.inventory_unit_id, v_variant_id,
    new.source_type, round(coalesce(new.gross_amount, 0), 2), new.status, new.created_at,
    coalesce(v_discount_mode, 'none'), coalesce(v_discount_value, 0),
    coalesce(v_payment_mode, 'none'), coalesce(v_payment_value, 0),
    coalesce(v_store_mode, 'none'), coalesce(v_store_value, 0),
    coalesce(v_extra_mode, 'none'), coalesce(v_extra_value, 0),
    coalesce(v_unit_cost, 0)
  )
  on conflict (allocation_id) do update
  set gross_amount = excluded.gross_amount,
      sale_status = excluded.sale_status,
      sold_at = excluded.sold_at;

  return new;
end;
$$;

drop trigger if exists investment_sale_allocations_financial_sync
  on public.investment_sale_allocations;
create trigger investment_sale_allocations_financial_sync
after insert or update of gross_amount, status
on public.investment_sale_allocations
for each row execute function public.sync_investor_financial_sale_entry();

-- Backfill das vendas que já existiam antes desta etapa.
insert into public.investor_financial_sale_entries(
  allocation_id, investor_id, lot_id, inventory_unit_id, variant_id,
  source_type, gross_amount, sale_status, sold_at,
  discount_mode, discount_value,
  payment_fee_mode, payment_fee_value,
  store_fee_mode, store_fee_value,
  extra_deduction_mode, extra_deduction_value,
  unit_cost
)
select
  a.id,
  a.investor_id,
  a.lot_id,
  a.inventory_unit_id,
  iu.variant_id,
  a.source_type,
  round(coalesce(a.gross_amount, 0), 2),
  a.status,
  a.created_at,
  coalesce(s.default_discount_mode, 'none'),
  coalesce(s.default_discount_value, 0),
  coalesce(s.default_payment_fee_mode, 'none'),
  coalesce(s.default_payment_fee_value, 0),
  coalesce(s.default_store_fee_mode, 'none'),
  coalesce(s.default_store_fee_value, 0),
  coalesce(s.default_extra_deduction_mode, 'none'),
  coalesce(s.default_extra_deduction_value, 0),
  coalesce(c.unit_cost, 0)
from public.investment_sale_allocations a
join public.inventory_units iu on iu.id = a.inventory_unit_id
left join public.investor_financial_settings s on s.investor_id = a.investor_id
left join public.investor_financial_product_costs c
  on c.investor_id = a.investor_id
 and c.lot_id = a.lot_id
 and c.variant_id = iu.variant_id
on conflict (allocation_id) do nothing;

-- View com todos os cálculos. O valor original da venda nunca é perdido.
create or replace view public.investor_financial_sales_live
with (security_invoker = false)
as
select
  e.id,
  e.allocation_id,
  e.investor_id,
  e.lot_id,
  l.code as lot_code,
  l.name as lot_name,
  e.inventory_unit_id,
  e.variant_id,
  pv.sku,
  pv.size,
  pv.color,
  p.id as product_id,
  p.name as product_name,
  p.slug as product_slug,
  p.active as product_active,
  coalesce(p.image_thumbnail_url, p.image_url) as image_url,
  e.source_type,
  e.gross_amount as automatic_gross_amount,
  coalesce(e.gross_amount_override, e.gross_amount) as gross_amount,
  e.gross_amount_override,
  e.sale_status,
  e.sold_at,
  e.discount_mode,
  e.discount_value,
  d.discount_amount,
  e.payment_fee_mode,
  e.payment_fee_value,
  f.payment_fee_amount,
  e.store_fee_mode,
  e.store_fee_value,
  sf.store_fee_amount,
  e.extra_deduction_mode,
  e.extra_deduction_value,
  x.extra_deduction_amount,
  e.unit_cost,
  e.net_received_override,
  coalesce(e.net_received_override, n.calculated_net_received) as net_received,
  round(coalesce(e.net_received_override, n.calculated_net_received) - e.unit_cost, 2) as profit,
  case
    when e.unit_cost > 0 then round(((coalesce(e.net_received_override, n.calculated_net_received) - e.unit_cost) / e.unit_cost) * 100, 2)
    else null
  end as profit_percent,
  e.notes,
  e.updated_at
from public.investor_financial_sale_entries e
join public.investment_lots l on l.id = e.lot_id
join public.product_variants pv on pv.id = e.variant_id
join public.products p on p.id = pv.product_id
cross join lateral (
  select public.investor_financial_rule_amount(
    coalesce(e.gross_amount_override, e.gross_amount), e.discount_mode, e.discount_value
  ) as discount_amount
) d
cross join lateral (
  select greatest(0, coalesce(e.gross_amount_override, e.gross_amount) - d.discount_amount) as after_discount
) b
cross join lateral (
  select public.investor_financial_rule_amount(b.after_discount, e.payment_fee_mode, e.payment_fee_value) as payment_fee_amount
) f
cross join lateral (
  select public.investor_financial_rule_amount(b.after_discount, e.store_fee_mode, e.store_fee_value) as store_fee_amount
) sf
cross join lateral (
  select public.investor_financial_rule_amount(b.after_discount, e.extra_deduction_mode, e.extra_deduction_value) as extra_deduction_amount
) x
cross join lateral (
  select round(greatest(0, b.after_discount - f.payment_fee_amount - sf.store_fee_amount - x.extra_deduction_amount), 2) as calculated_net_received
) n;

-- Segurança: todas as leituras/escritas passam pelo servidor com service role.
alter table public.investor_financial_settings enable row level security;
alter table public.investor_financial_product_costs enable row level security;
alter table public.investor_financial_sale_entries enable row level security;
alter table public.investor_cash_transactions enable row level security;
alter table public.investor_financial_audit enable row level security;

revoke all on table public.investor_financial_settings from public, anon, authenticated;
revoke all on table public.investor_financial_product_costs from public, anon, authenticated;
revoke all on table public.investor_financial_sale_entries from public, anon, authenticated;
revoke all on table public.investor_cash_transactions from public, anon, authenticated;
revoke all on table public.investor_financial_audit from public, anon, authenticated;
revoke all on table public.investor_financial_sales_live from public, anon, authenticated;
revoke all on function public.investor_financial_rule_amount(numeric, text, numeric) from public, anon, authenticated;
revoke all on function public.sync_investor_financial_sale_entry() from public, anon, authenticated;

grant all on table public.investor_financial_settings to service_role;
grant all on table public.investor_financial_product_costs to service_role;
grant all on table public.investor_financial_sale_entries to service_role;
grant all on table public.investor_cash_transactions to service_role;
grant all on table public.investor_financial_audit to service_role;
grant select on table public.investor_financial_sales_live to service_role;
grant execute on function public.investor_financial_rule_amount(numeric, text, numeric) to service_role;
grant execute on function public.sync_investor_financial_sale_entry() to service_role;

commit;

select
  'INVESTIDORES ETAPA 7 - CAIXA COMPLETO INSTALADO' as resultado,
  (select count(*) from public.investor_financial_sale_entries) as vendas_financeiras,
  (select count(*) from public.investor_cash_transactions) as movimentacoes_manuais;
