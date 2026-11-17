-- Execute no SQL Editor do Supabase depois da migração da Fase 3.
alter table public.products add column if not exists logistics_mode text not null default 'profile';
alter table public.products add column if not exists logistics_profile_id text;

-- Os padrões de peso, volume e embalagens são salvos como JSON na tabela store_settings,
-- usando o registro de id = 'logistics'. A tabela já é criada pela Fase 3.
