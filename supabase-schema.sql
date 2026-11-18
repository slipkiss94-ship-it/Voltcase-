-- VOLTCASE database. Paste all of this into Supabase > SQL Editor > Run.
create table products (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('cases','sunglasses')),
  name text not null,
  description text,
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  label text not null,
  price_zar numeric(10,2) not null check (price_zar > 0)
);
create table orders (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default ('VC-' || upper(substr(md5(random()::text),1,6))),
  name text not null, phone text not null, email text not null, address text not null,
  total_zar numeric(10,2) not null,
  status text not null default 'Pending Payment'
    check (status in ('Pending Payment','Paid','Processing','Shipped','Delivered')),
  created_at timestamptz not null default now()
);
create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_name text not null, variant_label text not null,
  qty int not null check (qty > 0), price_zar numeric(10,2) not null
);

alter table products enable row level security;
alter table variants enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;

-- Public (shoppers) can only read active products and their variants.
create policy "public read products" on products for select using (active);
create policy "public read variants" on variants for select
  using (exists (select 1 from products p where p.id = product_id and p.active));
-- Logged-in admin can do everything. Orders have NO public access at all.
create policy "admin products" on products for all to authenticated using (true) with check (true);
create policy "admin variants" on variants for all to authenticated using (true) with check (true);
create policy "admin orders" on orders for all to authenticated using (true) with check (true);
create policy "admin order items" on order_items for all to authenticated using (true) with check (true);

-- Product photo storage
insert into storage.buckets (id, name, public) values ('product-images','product-images',true) on conflict do nothing;
create policy "public read images" on storage.objects for select using (bucket_id = 'product-images');
create policy "admin upload images" on storage.objects for insert to authenticated with check (bucket_id = 'product-images');
create policy "admin delete images" on storage.objects for delete to authenticated using (bucket_id = 'product-images');
