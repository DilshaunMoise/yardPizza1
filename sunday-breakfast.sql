-- Pizza Yard Sunday Breakfast pre-orders
create table if not exists public.breakfast_orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  target_sunday date not null,
  customer_name text not null,
  customer_phone text not null,
  items jsonb not null default '[]'::jsonb,
  total numeric(12,2) not null default 0 check (total >= 0),
  special_instructions text,
  status text not null default 'new' check (status in ('new','preparing','ready','completed','cancelled')),
  staff_user_id uuid references auth.users(id) on delete set null
);
create index if not exists breakfast_orders_target_idx on public.breakfast_orders(target_sunday,created_at desc);
create index if not exists breakfast_orders_status_idx on public.breakfast_orders(status,created_at desc);
alter table public.breakfast_orders enable row level security;
drop policy if exists "Anyone can submit breakfast pre-orders" on public.breakfast_orders;
create policy "Anyone can submit breakfast pre-orders" on public.breakfast_orders for insert to anon,authenticated with check (true);
drop policy if exists "Staff can view breakfast pre-orders" on public.breakfast_orders;
create policy "Staff can view breakfast pre-orders" on public.breakfast_orders for select to authenticated using (exists(select 1 from public.staff_users where staff_users.user_id=(select auth.uid())));
drop policy if exists "Staff can update breakfast pre-orders" on public.breakfast_orders;
create policy "Staff can update breakfast pre-orders" on public.breakfast_orders for update to authenticated using (exists(select 1 from public.staff_users where staff_users.user_id=(select auth.uid()))) with check (exists(select 1 from public.staff_users where staff_users.user_id=(select auth.uid())));
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='breakfast_orders') then
    alter publication supabase_realtime add table public.breakfast_orders;
  end if;
end $$;
