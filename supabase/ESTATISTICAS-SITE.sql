-- A&C Moda — Etapa 1: estatísticas anônimas do site
-- Registra eventos de navegação sem salvar nome, e-mail, telefone ou endereço.

create extension if not exists pgcrypto;

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  visitor_id text not null check (char_length(visitor_id) between 8 and 80),
  session_id text not null check (char_length(session_id) between 8 and 80),
  event_type text not null check (
    event_type in (
      'page_view',
      'product_view',
      'add_to_cart',
      'checkout_start',
      'order_success'
    )
  ),
  path text not null default '/',
  product_slug text,
  referrer_host text,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_created_at_idx
  on public.analytics_events (created_at desc);

create index if not exists analytics_events_event_type_created_at_idx
  on public.analytics_events (event_type, created_at desc);

create index if not exists analytics_events_product_slug_created_at_idx
  on public.analytics_events (product_slug, created_at desc)
  where product_slug is not null;

create index if not exists analytics_events_visitor_created_at_idx
  on public.analytics_events (visitor_id, created_at desc);

alter table public.analytics_events enable row level security;

revoke all on table public.analytics_events from anon, authenticated;
grant select, insert on table public.analytics_events to service_role;

create or replace function public.get_analytics_dashboard_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with params as (
  select timezone('America/Recife', now())::date as today_local
),
base as (
  select
    visitor_id,
    event_type,
    product_slug,
    timezone('America/Recife', created_at)::date as local_date
  from public.analytics_events
  where created_at >= now() - interval '31 days'
),
summary as (
  select
    count(distinct visitor_id) filter (
      where event_type = 'page_view'
        and local_date = params.today_local
    )::int as today_visitors,
    count(*) filter (
      where event_type = 'page_view'
        and local_date = params.today_local
    )::int as today_page_views,
    count(*) filter (
      where event_type = 'product_view'
        and local_date = params.today_local
    )::int as today_product_views,
    count(*) filter (
      where event_type = 'add_to_cart'
        and local_date = params.today_local
    )::int as today_add_to_carts,
    count(*) filter (
      where event_type = 'checkout_start'
        and local_date = params.today_local
    )::int as today_checkout_starts,
    count(*) filter (
      where event_type = 'order_success'
        and local_date = params.today_local
    )::int as today_order_successes,

    count(distinct visitor_id) filter (
      where event_type = 'page_view'
        and local_date >= params.today_local - 6
    )::int as seven_visitors,
    count(*) filter (
      where event_type = 'page_view'
        and local_date >= params.today_local - 6
    )::int as seven_page_views,
    count(*) filter (
      where event_type = 'product_view'
        and local_date >= params.today_local - 6
    )::int as seven_product_views,
    count(*) filter (
      where event_type = 'add_to_cart'
        and local_date >= params.today_local - 6
    )::int as seven_add_to_carts,
    count(*) filter (
      where event_type = 'checkout_start'
        and local_date >= params.today_local - 6
    )::int as seven_checkout_starts,
    count(*) filter (
      where event_type = 'order_success'
        and local_date >= params.today_local - 6
    )::int as seven_order_successes,

    count(distinct visitor_id) filter (
      where event_type = 'page_view'
        and local_date >= params.today_local - 29
    )::int as thirty_visitors,
    count(*) filter (
      where event_type = 'page_view'
        and local_date >= params.today_local - 29
    )::int as thirty_page_views,
    count(*) filter (
      where event_type = 'product_view'
        and local_date >= params.today_local - 29
    )::int as thirty_product_views,
    count(*) filter (
      where event_type = 'add_to_cart'
        and local_date >= params.today_local - 29
    )::int as thirty_add_to_carts,
    count(*) filter (
      where event_type = 'checkout_start'
        and local_date >= params.today_local - 29
    )::int as thirty_checkout_starts,
    count(*) filter (
      where event_type = 'order_success'
        and local_date >= params.today_local - 29
    )::int as thirty_order_successes
  from base
  cross join params
),
days as (
  select generate_series(
    (select today_local from params) - 6,
    (select today_local from params),
    interval '1 day'
  )::date as day
),
daily as (
  select
    days.day,
    count(distinct base.visitor_id) filter (
      where base.event_type = 'page_view'
    )::int as visitors,
    count(*) filter (
      where base.event_type = 'page_view'
    )::int as page_views
  from days
  left join base on base.local_date = days.day
  group by days.day
  order by days.day
),
top_products as (
  select
    product_slug as slug,
    count(*)::int as views
  from base
  cross join params
  where event_type = 'product_view'
    and product_slug is not null
    and product_slug <> ''
    and local_date >= params.today_local - 29
  group by product_slug
  order by count(*) desc, product_slug asc
  limit 8
)
select jsonb_build_object(
  'today', jsonb_build_object(
    'visitors', summary.today_visitors,
    'pageViews', summary.today_page_views,
    'productViews', summary.today_product_views,
    'addToCarts', summary.today_add_to_carts,
    'checkoutStarts', summary.today_checkout_starts,
    'orderSuccesses', summary.today_order_successes
  ),
  'last7Days', jsonb_build_object(
    'visitors', summary.seven_visitors,
    'pageViews', summary.seven_page_views,
    'productViews', summary.seven_product_views,
    'addToCarts', summary.seven_add_to_carts,
    'checkoutStarts', summary.seven_checkout_starts,
    'orderSuccesses', summary.seven_order_successes
  ),
  'last30Days', jsonb_build_object(
    'visitors', summary.thirty_visitors,
    'pageViews', summary.thirty_page_views,
    'productViews', summary.thirty_product_views,
    'addToCarts', summary.thirty_add_to_carts,
    'checkoutStarts', summary.thirty_checkout_starts,
    'orderSuccesses', summary.thirty_order_successes
  ),
  'daily', coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'date', daily.day,
          'visitors', daily.visitors,
          'pageViews', daily.page_views
        )
        order by daily.day
      )
      from daily
    ),
    '[]'::jsonb
  ),
  'topProducts', coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'slug', top_products.slug,
          'views', top_products.views
        )
        order by top_products.views desc, top_products.slug asc
      )
      from top_products
    ),
    '[]'::jsonb
  )
)
from summary;
$$;

revoke all on function public.get_analytics_dashboard_stats() from public, anon, authenticated;
grant execute on function public.get_analytics_dashboard_stats() to service_role;
