begin;

alter table public.products
  add column if not exists garment_shape text;

alter table public.products
  add column if not exists color_hexes jsonb;

alter table public.products
  alter column color_hexes set default '{}'::jsonb;

update public.products
set color_hexes = '{}'::jsonb
where color_hexes is null
   or jsonb_typeof(color_hexes) is distinct from 'object';

update public.products
set garment_shape =
  case
    when lower(coalesce(subcategory, '') || ' ' || coalesce(name, '')) like '%body%' then 'body'
    when lower(coalesce(subcategory, '') || ' ' || coalesce(name, '')) like '%macac%' then 'macacao'
    when lower(coalesce(subcategory, '') || ' ' || coalesce(name, '')) like '%jardineira%' then 'macacao'
    when lower(coalesce(subcategory, '') || ' ' || coalesce(name, '')) like '%vestido%' then 'vestido'
    when lower(coalesce(subcategory, '') || ' ' || coalesce(name, '')) like '%conjunto%' then 'conjunto'
    when lower(coalesce(subcategory, '') || ' ' || coalesce(name, '')) like '%jaqueta%' then 'jaqueta'
    when lower(coalesce(subcategory, '') || ' ' || coalesce(name, '')) like '%casaco%' then 'jaqueta'
    when lower(coalesce(subcategory, '') || ' ' || coalesce(name, '')) like '%moletom%' then 'jaqueta'
    when lower(coalesce(subcategory, '') || ' ' || coalesce(name, '')) like '%camiseta%' then 'camiseta'
    when lower(coalesce(subcategory, '') || ' ' || coalesce(name, '')) like '%camisa%' then 'camisa'
    when lower(coalesce(subcategory, '') || ' ' || coalesce(name, '')) like '%blusa%' then 'blusa'
    when lower(coalesce(subcategory, '') || ' ' || coalesce(name, '')) like '%cropped%' then 'blusa'
    when lower(coalesce(subcategory, '') || ' ' || coalesce(name, '')) like '%calça%' then 'calca'
    when lower(coalesce(subcategory, '') || ' ' || coalesce(name, '')) like '%calca%' then 'calca'
    when lower(coalesce(subcategory, '') || ' ' || coalesce(name, '')) like '%jeans%' then 'calca'
    when lower(coalesce(subcategory, '') || ' ' || coalesce(name, '')) like '%bermuda%' then 'bermuda'
    when lower(coalesce(subcategory, '') || ' ' || coalesce(name, '')) like '%short%' then 'short'
    when lower(coalesce(subcategory, '') || ' ' || coalesce(name, '')) like '%saia%' then 'saia'
    when lower(coalesce(subcategory, '') || ' ' || coalesce(name, '')) like '%bolsa%' then 'bolsa'
    when lower(coalesce(subcategory, '') || ' ' || coalesce(name, '')) like '%carteira%' then 'bolsa'
    when category = 'Infantil' then 'infantil'
    when category = 'Acessórios' then 'acessorio'
    when category = 'Masculino' then 'camiseta'
    else 'blusa'
  end
where garment_shape is null
   or trim(garment_shape) = '';

update public.products p
set color_hexes = coalesce(
  (
    select jsonb_object_agg(
      colors.color,
      case
        when lower(colors.color) like '%preto%' then '#161616'
        when lower(colors.color) like '%off-white%' then '#EDE8DD'
        when lower(colors.color) like '%branco%' then '#F6F3ED'
        when lower(colors.color) like '%creme%' then '#EFE1C3'
        when lower(colors.color) like '%bege%' then '#D8C3A5'
        when lower(colors.color) like '%areia%' then '#CDBB9F'
        when lower(colors.color) like '%nude%' then '#D7AB90'
        when lower(colors.color) like '%caramelo%' then '#B77945'
        when lower(colors.color) like '%chocolate%' then '#4A2C22'
        when lower(colors.color) like '%marrom%' then '#6B4430'
        when lower(colors.color) like '%chumbo%' then '#414141'
        when lower(colors.color) like '%cinza%' then '#8A8A8A'
        when lower(colors.color) like '%pink%' then '#E83E8C'
        when lower(colors.color) like '%rosa%' then '#E66B91'
        when lower(colors.color) like '%coral%' then '#E97868'
        when lower(colors.color) like '%vermelho%' then '#C92A2A'
        when lower(colors.color) like '%bordô%' then '#6D2034'
        when lower(colors.color) like '%bordo%' then '#6D2034'
        when lower(colors.color) like '%vinho%' then '#7A1E37'
        when lower(colors.color) like '%terracota%' then '#B85C3C'
        when lower(colors.color) like '%laranja%' then '#E8792E'
        when lower(colors.color) like '%mostarda%' then '#B58A1B'
        when lower(colors.color) like '%amarelo%' then '#E4B942'
        when lower(colors.color) like '%menta%' then '#9FD9C1'
        when lower(colors.color) like '%oliva%' then '#6F7442'
        when lower(colors.color) like '%militar%' then '#4E5B3C'
        when lower(colors.color) like '%verde%' then '#3E8C57'
        when lower(colors.color) like '%marinho%' then '#172C4A'
        when lower(colors.color) like '%royal%' then '#244BC1'
        when lower(colors.color) like '%bebê%' then '#9CCDEB'
        when lower(colors.color) like '%bebe%' then '#9CCDEB'
        when lower(colors.color) like '%turquesa%' then '#35A7A0'
        when lower(colors.color) like '%azul%' then '#3478C7'
        when lower(colors.color) like '%lilás%' then '#B69AD9'
        when lower(colors.color) like '%lilas%' then '#B69AD9'
        when lower(colors.color) like '%roxo%' then '#70439A'
        when lower(colors.color) like '%jeans claro%' then '#7899B6'
        when lower(colors.color) like '%jeans escuro%' then '#36536C'
        when lower(colors.color) like '%dourado%' then '#C6A15B'
        when lower(colors.color) like '%prata%' then '#B7BCC5'
        when lower(colors.color) like '%cáqui%' then '#A89A6D'
        when lower(colors.color) like '%caqui%' then '#A89A6D'
        else '#A46B45'
      end
    )
    from (
      select distinct pv.color
      from public.product_variants pv
      where pv.product_id = p.id
        and pv.active is distinct from false
        and nullif(trim(pv.color), '') is not null
    ) as colors
  ),
  '{}'::jsonb
)
where p.color_hexes = '{}'::jsonb;

alter table public.products
  alter column garment_shape set default 'blusa';

alter table public.products
  alter column garment_shape set not null;

alter table public.products
  alter column color_hexes set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_garment_shape_check'
  ) then
    alter table public.products
      add constraint products_garment_shape_check
      check (
        garment_shape in (
          'vestido',
          'blusa',
          'camisa',
          'camiseta',
          'calca',
          'short',
          'bermuda',
          'saia',
          'conjunto',
          'macacao',
          'body',
          'jaqueta',
          'infantil',
          'bolsa',
          'acessorio'
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_color_hexes_object_check'
  ) then
    alter table public.products
      add constraint products_color_hexes_object_check
      check (jsonb_typeof(color_hexes) = 'object');
  end if;
end
$$;

commit;
