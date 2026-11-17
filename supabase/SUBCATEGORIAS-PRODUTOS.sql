-- A&C Moda — subcategorias de produtos
-- Execute uma única vez no SQL Editor do Supabase antes de publicar o código.

alter table public.products
  add column if not exists subcategory text not null default 'Outros';

create index if not exists products_category_subcategory_idx
  on public.products (category, subcategory);

-- Classifica automaticamente os produtos existentes pelo nome.
update public.products
set subcategory = 'Vestidos'
where (subcategory is null or subcategory = '' or subcategory = 'Outros')
  and lower(name) like '%vestido%';

update public.products
set subcategory = 'Calças'
where (subcategory is null or subcategory = '' or subcategory = 'Outros')
  and (
    lower(name) like '%calça%'
    or lower(name) like '%calca%'
  );

update public.products
set subcategory = 'Saias'
where (subcategory is null or subcategory = '' or subcategory = 'Outros')
  and lower(name) like '%saia%';

update public.products
set subcategory = 'Shorts'
where (subcategory is null or subcategory = '' or subcategory = 'Outros')
  and lower(name) like '%short%';

update public.products
set subcategory = 'Conjuntos'
where (subcategory is null or subcategory = '' or subcategory = 'Outros')
  and lower(name) like '%conjunto%';

update public.products
set subcategory = 'Macacões'
where (subcategory is null or subcategory = '' or subcategory = 'Outros')
  and (
    lower(name) like '%macacão%'
    or lower(name) like '%macacao%'
  );

update public.products
set subcategory = 'Bodies'
where (subcategory is null or subcategory = '' or subcategory = 'Outros')
  and lower(name) like '%body%';

update public.products
set subcategory = 'Blusas'
where (subcategory is null or subcategory = '' or subcategory = 'Outros')
  and (
    lower(name) like '%blusa%'
    or lower(name) like '%cropped%'
  );

update public.products
set subcategory = 'Camisas'
where (subcategory is null or subcategory = '' or subcategory = 'Outros')
  and lower(name) like '%camisa%';

update public.products
set subcategory = 'Camisetas'
where (subcategory is null or subcategory = '' or subcategory = 'Outros')
  and lower(name) like '%camiseta%';

update public.products
set subcategory = 'Bermudas'
where (subcategory is null or subcategory = '' or subcategory = 'Outros')
  and lower(name) like '%bermuda%';

update public.products
set subcategory = 'Bolsas'
where (subcategory is null or subcategory = '' or subcategory = 'Outros')
  and lower(name) like '%bolsa%';

update public.products
set subcategory = 'Cintos'
where (subcategory is null or subcategory = '' or subcategory = 'Outros')
  and lower(name) like '%cinto%';
