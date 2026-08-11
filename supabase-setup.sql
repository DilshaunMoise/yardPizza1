-- Pizza Yard Supabase setup. Run in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.pizza_orders (
 id uuid primary key default gen_random_uuid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 customer_name text not null,
 customer_phone text not null,
 customer_email text not null,
 order_type text not null check(order_type in ('pickup','delivery')),
 delivery_address text,
 pizza_size text not null,
 toppings jsonb not null default '[]'::jsonb,
 topping_count integer not null check(topping_count>=0),
 unit_price numeric(10,2) not null check(unit_price>=0),
 included_toppings integer not null check(included_toppings>=0),
 extra_toppings integer not null check(extra_toppings>=0),
 extra_topping_cost numeric(10,2) not null check(extra_topping_cost>=0),
 quantity integer not null check(quantity>=1),
 delivery_fee numeric(10,2) not null default 0 check(delivery_fee>=0),
 special_instructions text,
 total numeric(10,2) not null check(total>=0),
 status text not null default 'new' check(status in ('new','preparing','ready','completed','cancelled'))
);
create index if not exists pizza_orders_created_at_idx on public.pizza_orders(created_at desc);
create index if not exists pizza_orders_status_idx on public.pizza_orders(status);

alter table public.pizza_orders
  add column if not exists tracking_token text;

create unique index if not exists pizza_orders_tracking_token_idx
  on public.pizza_orders(tracking_token)
  where tracking_token is not null;

do $$
begin
  alter table public.pizza_orders drop constraint if exists pizza_orders_status_check;
  alter table public.pizza_orders
    add constraint pizza_orders_status_check
    check(status in ('new','preparing','in_oven','ready','completed','cancelled'));
exception when duplicate_object then null;
end $$;

create table if not exists public.staff_users (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);

alter table public.pizza_orders enable row level security;
alter table public.staff_users enable row level security;

drop policy if exists "Staff can view own staff record" on public.staff_users;
create policy "Staff can view own staff record" on public.staff_users
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Anyone can create pizza orders" on public.pizza_orders;
create policy "Anyone can create pizza orders" on public.pizza_orders
for insert to anon, authenticated with check(true);

drop policy if exists "Staff can view pizza orders" on public.pizza_orders;
create policy "Staff can view pizza orders" on public.pizza_orders for select to authenticated
using(exists(select 1 from public.staff_users where staff_users.user_id=(select auth.uid())));

drop policy if exists "Staff can update pizza orders" on public.pizza_orders;
create policy "Staff can update pizza orders" on public.pizza_orders for update to authenticated
using(exists(select 1 from public.staff_users where staff_users.user_id=(select auth.uid())))
with check(exists(select 1 from public.staff_users where staff_users.user_id=(select auth.uid())));

create or replace function public.set_pizza_order_updated_at()
returns trigger language plpgsql security invoker as $$
begin new.updated_at=now(); return new; end; $$;
drop trigger if exists pizza_orders_set_updated_at on public.pizza_orders;
create trigger pizza_orders_set_updated_at before update on public.pizza_orders for each row execute function public.set_pizza_order_updated_at();

alter table public.pizza_orders replica identity full;
do $$ begin
 alter publication supabase_realtime add table public.pizza_orders;
exception when duplicate_object then null; end $$;

-- After creating the staff Auth user, add its UUID with:
-- insert into public.staff_users(user_id) values ('PASTE_AUTH_USER_UUID_HERE');


-- Secure customer tracking: returns only limited status information for a
-- customer holding the unguessable tracking token. No direct SELECT policy
-- is granted to anonymous visitors.
create or replace function public.get_pizza_order_status(p_tracking_token text)
returns table (
  id uuid,
  created_at timestamptz,
  status text,
  customer_name text,
  total numeric,
  pizza_size text,
  quantity integer,
  order_type text
)
language sql
security definer
set search_path = public
as $$
  select o.id, o.created_at, o.status, o.customer_name, o.total,
         o.pizza_size, o.quantity, o.order_type
  from public.pizza_orders o
  where o.tracking_token = p_tracking_token
  limit 1;
$$;

revoke all on function public.get_pizza_order_status(text) from public;
grant execute on function public.get_pizza_order_status(text) to anon, authenticated;


-- Safe upgrade for the live database: allow the full staff workflow.
do $$
begin
  alter table public.pizza_orders drop constraint if exists pizza_orders_status_check;
exception when undefined_object then null;
end $$;

alter table public.pizza_orders
  add constraint pizza_orders_status_check
  check (status in ('new','preparing','in_oven','ready','completed','cancelled'));

drop policy if exists "Staff can update pizza orders" on public.pizza_orders;
create policy "Staff can update pizza orders"
on public.pizza_orders
for update
to authenticated
using (exists (
  select 1 from public.staff_users
  where staff_users.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.staff_users
  where staff_users.user_id = (select auth.uid())
));

-- ============================================================
-- Pizza Yard upgrades: order numbers, source, half-and-half,
-- optional staff email, and live topping availability.
-- Run this section once in the existing Supabase project.
-- ============================================================

alter table public.pizza_orders
  add column if not exists order_number bigint generated by default as identity;

alter table public.pizza_orders
  add column if not exists order_source text not null default 'online';

do $$
begin
  alter table public.pizza_orders drop constraint if exists pizza_orders_order_source_check;
  alter table public.pizza_orders
    add constraint pizza_orders_order_source_check
    check (order_source in ('online','staff'));
exception when duplicate_object then null;
end $$;

alter table public.pizza_orders
  alter column customer_email drop not null;

create unique index if not exists pizza_orders_order_number_idx
  on public.pizza_orders(order_number);

create table if not exists public.pizza_topping_availability (
  name text primary key,
  available boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.pizza_topping_availability(name, available) values
  ('Corn', true),
  ('Pepperoni', true),
  ('Mushroom', true),
  ('Tuna', true),
  ('Bacon', true),
  ('Ham', true),
  ('Bell Peppers', true),
  ('Sausage', true),
  ('Veg', true)
on conflict (name) do nothing;

alter table public.pizza_topping_availability enable row level security;

drop policy if exists "Anyone can view topping availability" on public.pizza_topping_availability;
create policy "Anyone can view topping availability"
on public.pizza_topping_availability
for select to anon, authenticated
using (true);

drop policy if exists "Staff can insert topping availability" on public.pizza_topping_availability;
create policy "Staff can insert topping availability"
on public.pizza_topping_availability
for insert to authenticated
with check (exists (
  select 1 from public.staff_users
  where staff_users.user_id = (select auth.uid())
));

drop policy if exists "Staff can update topping availability" on public.pizza_topping_availability;
create policy "Staff can update topping availability"
on public.pizza_topping_availability
for update to authenticated
using (exists (
  select 1 from public.staff_users
  where staff_users.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.staff_users
  where staff_users.user_id = (select auth.uid())
));

create or replace function public.set_topping_availability_updated_at()
returns trigger language plpgsql security invoker as $$
begin new.updated_at=now(); return new; end; $$;
drop trigger if exists pizza_topping_availability_set_updated_at on public.pizza_topping_availability;
create trigger pizza_topping_availability_set_updated_at
before update on public.pizza_topping_availability
for each row execute function public.set_topping_availability_updated_at();


-- ============================================================
-- Customer reviews: public submissions, staff approval.
-- Run this section once after the previous Pizza Yard SQL.
-- ============================================================
create table if not exists public.pizza_reviews (
 id uuid primary key default gen_random_uuid(),
 created_at timestamptz not null default now(),
 display_name text not null default 'Customer',
 rating integer not null check (rating between 1 and 5),
 comment text not null check (char_length(trim(comment)) between 1 and 500),
 approved boolean not null default false
);
create index if not exists pizza_reviews_approved_created_idx on public.pizza_reviews(approved, created_at desc);
alter table public.pizza_reviews enable row level security;
drop policy if exists "Anyone can view approved reviews" on public.pizza_reviews;
create policy "Anyone can view approved reviews" on public.pizza_reviews for select to anon, authenticated using (approved=true or exists(select 1 from public.staff_users where staff_users.user_id=(select auth.uid())));
drop policy if exists "Anyone can submit reviews" on public.pizza_reviews;
create policy "Anyone can submit reviews" on public.pizza_reviews for insert to anon, authenticated with check (approved=false);
drop policy if exists "Staff can moderate reviews" on public.pizza_reviews;
create policy "Staff can moderate reviews" on public.pizza_reviews for update to authenticated using(exists(select 1 from public.staff_users where staff_users.user_id=(select auth.uid()))) with check(exists(select 1 from public.staff_users where staff_users.user_id=(select auth.uid())));


-- ============================================================
-- Pizza Yard v2: multi-item staff orders, payment tracking.
-- Run this section once after the previous Pizza Yard SQL.
-- ============================================================
alter table public.pizza_orders add column if not exists order_items jsonb;
alter table public.pizza_orders add column if not exists payment_status text not null default 'unpaid';
alter table public.pizza_orders add column if not exists payment_method text;
do $$ begin
  alter table public.pizza_orders drop constraint if exists pizza_orders_payment_status_check;
  alter table public.pizza_orders add constraint pizza_orders_payment_status_check check(payment_status in ('paid','unpaid','refunded'));
exception when duplicate_object then null; end $$;



-- ============================================================
-- Pizza Yard Inventory Site
-- Run this section once after the existing Pizza Yard SQL.
-- ============================================================

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  category text not null default 'Other',
  quantity numeric(12,3) not null default 0 check (quantity >= 0),
  unit text not null default 'pieces',
  weight numeric(12,3) check (weight is null or weight >= 0),
  weight_unit text not null default 'kg',
  min_quantity numeric(12,3) not null default 0 check (min_quantity >= 0),
  min_weight numeric(12,3) check (min_weight is null or min_weight >= 0),
  supplier text,
  cost numeric(12,2) check (cost is null or cost >= 0),
  notes text,
  weight_tracking boolean not null default false
);

create index if not exists inventory_items_name_idx
  on public.inventory_items(lower(name));
create index if not exists inventory_items_category_idx
  on public.inventory_items(category);

create table if not exists public.inventory_stock_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  event_type text not null check (
    event_type in ('delivery','used','damaged','spoiled','count','adjustment')
  ),
  quantity_before numeric(12,3),
  quantity_after numeric(12,3),
  weight_before numeric(12,3),
  weight_after numeric(12,3),
  reason text,
  note text,
  staff_user_id uuid references auth.users(id) on delete set null
);

create index if not exists inventory_stock_events_item_idx
  on public.inventory_stock_events(item_id, created_at desc);

create table if not exists public.inventory_daily_counts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  count_date date not null default current_date,
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  quantity numeric(12,3) not null default 0 check (quantity >= 0),
  weight numeric(12,3) check (weight is null or weight >= 0),
  note text,
  staff_user_id uuid references auth.users(id) on delete set null,
  unique(count_date, item_id)
);

create index if not exists inventory_daily_counts_date_idx
  on public.inventory_daily_counts(count_date desc);

alter table public.inventory_items enable row level security;
alter table public.inventory_stock_events enable row level security;
alter table public.inventory_daily_counts enable row level security;

drop policy if exists "Staff can manage inventory items" on public.inventory_items;
create policy "Staff can manage inventory items"
on public.inventory_items for all to authenticated
using (exists (
  select 1 from public.staff_users
  where staff_users.user_id=(select auth.uid())
))
with check (exists (
  select 1 from public.staff_users
  where staff_users.user_id=(select auth.uid())
));

drop policy if exists "Staff can manage inventory events" on public.inventory_stock_events;
create policy "Staff can manage inventory events"
on public.inventory_stock_events for all to authenticated
using (exists (
  select 1 from public.staff_users
  where staff_users.user_id=(select auth.uid())
))
with check (exists (
  select 1 from public.staff_users
  where staff_users.user_id=(select auth.uid())
));

drop policy if exists "Staff can manage inventory daily counts" on public.inventory_daily_counts;
create policy "Staff can manage inventory daily counts"
on public.inventory_daily_counts for all to authenticated
using (exists (
  select 1 from public.staff_users
  where staff_users.user_id=(select auth.uid())
))
with check (exists (
  select 1 from public.staff_users
  where staff_users.user_id=(select auth.uid())
));

create or replace function public.set_inventory_updated_at()
returns trigger language plpgsql security invoker as $$
begin
  new.updated_at=now();
  return new;
end;
$$;

drop trigger if exists inventory_items_set_updated_at on public.inventory_items;
create trigger inventory_items_set_updated_at
before update on public.inventory_items
for each row execute function public.set_inventory_updated_at();

-- Starter inventory list. Quantities are intentionally editable.
insert into public.inventory_items (name, category, quantity, unit, weight_tracking)
values
  ('Cheese','Ingredients',0,'kg',true),
  ('Pepperoni','Ingredients',0,'kg',true),
  ('Chicken','Ingredients',0,'kg',true),
  ('Veg','Ingredients',0,'kg',true),
  ('Mushroom','Ingredients',0,'kg',true),
  ('Corn','Ingredients',0,'kg',true),
  ('Tuna','Ingredients',0,'kg',true),
  ('Bacon','Ingredients',0,'kg',true),
  ('Ham','Ingredients',0,'kg',true),
  ('Bell Peppers','Ingredients',0,'kg',true),
  ('Sausage','Ingredients',0,'kg',true),
  ('Pizza Sauce','Ingredients',0,'kg',true),
  ('Dough','Ingredients',0,'kg',true),
  ('Pizza Boxes','Packaging',100,'boxes',false),
  ('Napkins','Customer Supplies',0,'pieces',false),
  ('Forks','Customer Supplies',0,'pieces',false),
  ('Spoons','Customer Supplies',0,'pieces',false),
  ('Plates','Customer Supplies',0,'pieces',false),
  ('Cups','Customer Supplies',0,'pieces',false),
  ('Paper Towels','Cleaning & Store',0,'packs',false),
  ('Garbage Bags','Cleaning & Store',0,'bags',false),
  ('Cleaning Products','Cleaning & Store',0,'bottles',false),
  ('Gloves','Cleaning & Store',0,'boxes',false)
on conflict do nothing;
