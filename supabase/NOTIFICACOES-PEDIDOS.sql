-- A&C Moda — Etapa 2: notificações de pedidos
-- Execute no Supabase > SQL Editor antes de substituir os arquivos do projeto.
-- Esta tabela não é acessível diretamente pelo navegador. O painel usa o servidor.

create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('new_order', 'payment_approved')),
  order_id uuid not null references public.orders(id) on delete cascade,
  title text not null,
  message text,
  unique_key text not null unique,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists admin_notifications_unread_idx
  on public.admin_notifications (created_at desc)
  where read_at is null;

create index if not exists admin_notifications_order_idx
  on public.admin_notifications (order_id, created_at desc);

alter table public.admin_notifications enable row level security;

-- O navegador não precisa ler ou escrever esta tabela diretamente.
revoke all on table public.admin_notifications from anon, authenticated;

create or replace function public.notify_admin_about_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.admin_notifications (
      kind,
      order_id,
      title,
      message,
      unique_key
    )
    values (
      'new_order',
      new.id,
      'Novo pedido ' || coalesce(new.public_code, left(new.id::text, 8)),
      'Pedido recebido de ' || coalesce(nullif(new.customer_name, ''), 'cliente não identificado') || '.',
      'new-order:' || new.id::text
    )
    on conflict (unique_key) do nothing;

    if new.status = 'paid' then
      insert into public.admin_notifications (
        kind,
        order_id,
        title,
        message,
        unique_key
      )
      values (
        'payment_approved',
        new.id,
        'Pagamento confirmado',
        'O pagamento do pedido ' || coalesce(new.public_code, left(new.id::text, 8)) || ' foi aprovado.',
        'payment-approved:' || new.id::text
      )
      on conflict (unique_key) do nothing;
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.status = 'paid'
     and old.status is distinct from new.status then
    insert into public.admin_notifications (
      kind,
      order_id,
      title,
      message,
      unique_key
    )
    values (
      'payment_approved',
      new.id,
      'Pagamento confirmado',
      'O pagamento do pedido ' || coalesce(new.public_code, left(new.id::text, 8)) || ' foi aprovado.',
      'payment-approved:' || new.id::text
    )
    on conflict (unique_key) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_admin_order_notifications on public.orders;

create trigger trg_admin_order_notifications
after insert or update of status
on public.orders
for each row
execute function public.notify_admin_about_order();
