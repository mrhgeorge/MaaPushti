-- MaaPushti update 3: family dashboard, choose-your-basket, and pre-orders with a deposit.
-- Run this once in Supabase > SQL Editor (after schema.sql and update_2). Safe to run again.

-- ---------- family logins ----------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin','maa_bondhu','shopkeeper','doctor','family'));
alter table public.profiles add column if not exists mother_id uuid references public.mothers(id) on delete cascade;
alter table public.profiles add column if not exists relation text;   -- husband, mother-in-law, son, daughter...

create or replace function public.my_mother() returns uuid
language sql stable security definer set search_path = public as
$$ select mother_id from public.profiles where id = auth.uid() and role = 'family' and active $$;

create or replace function public.is_my_mother(m uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.mothers where id = m and maa_bondhu_id = auth.uid()) and public.my_role() = 'maa_bondhu' $$;

-- People a family member may see: the mother's Maa Bondhu, her shop, and doctors who advised her.
create or replace function public.family_contacts() returns setof uuid
language sql stable security definer set search_path = public as
$$ select maa_bondhu_id from public.mothers where id = public.my_mother()
   union select shop_id from public.mothers where id = public.my_mother() and shop_id is not null
   union select doctor_id from public.consultations where mother_id = public.my_mother() $$;

drop policy if exists p_profiles_read on public.profiles;
create policy p_profiles_read on public.profiles for select using (
  id = auth.uid() or public.is_admin()
  or (public.my_role() = 'maa_bondhu' and role in ('doctor','shopkeeper') and active)
  or (public.my_role() = 'maa_bondhu' and role = 'family' and public.is_my_mother(mother_id))
  or (public.my_role() = 'doctor' and id in (select maa_bondhu_id from public.consultations where doctor_id = auth.uid()))
  or (public.my_role() = 'family' and id in (select public.family_contacts())));

-- A Maa Bondhu may create family logins for her own mothers (with the mother's consent).
drop policy if exists p_profiles_family_insert on public.profiles;
create policy p_profiles_family_insert on public.profiles for insert with check (
  public.my_role() = 'maa_bondhu' and role = 'family' and public.is_my_mother(mother_id));

-- Only the admin can move a family login to another mother.
create or replace function public.guard_profile() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.id := old.id; new.phone := old.phone; new.created_at := old.created_at;
  if not public.is_admin() then
    new.role := old.role; new.active := old.active; new.area := old.area; new.mother_id := old.mother_id;
    new.division := old.division; new.district := old.district; new.upazila := old.upazila; new.union_name := old.union_name;
  end if;
  return new;
end $$;

-- What the family can read: their own mother, her doctor advice, her basket khata, and alerts they raise.
drop policy if exists p_mothers_family on public.mothers;
create policy p_mothers_family on public.mothers for select using (id = public.my_mother());
drop policy if exists p_consult_family on public.consultations;
create policy p_consult_family on public.consultations for select using (mother_id = public.my_mother());
drop policy if exists p_sales_family on public.sales;
create policy p_sales_family on public.sales for select using (mother_id = public.my_mother());
drop policy if exists p_alerts_family_read on public.alerts;
create policy p_alerts_family_read on public.alerts for select using (mother_id = public.my_mother());
drop policy if exists p_alerts_family_insert on public.alerts;
create policy p_alerts_family_insert on public.alerts for insert with check (mother_id = public.my_mother() and source = 'family' and status = 'open');

-- ---------- basket choices ----------
create table if not exists public.basket_choices (
  code text primary key,
  name text not null,
  price int not null,
  perishable boolean not null default false,
  why text,
  sort int not null default 0,
  active boolean not null default true
);
insert into public.basket_choices (code, name, price, perishable, why, sort) values
  ('peanuts',   'Peanuts, 200 g', 30, false, 'Protein, healthy fat and folate. Skip if she is allergic to peanuts.', 1),
  ('chickpeas', 'Chickpeas (chola), 250 g', 30, false, 'Protein and iron.', 2),
  ('dates',     'Dates (khejur), 100 g', 35, false, 'Iron and quick energy.', 3),
  ('eggs4',     'Extra eggs x4', 60, false, 'More protein for the baby''s growth.', 4),
  ('fruit',     'Pushti Plus fruit pack: 2 carrots, 2 lemons, 2 guavas, 2 bananas, 2 sofeda', 80, true, 'Vitamin C from lemon and guava helps her body absorb iron from dal and greens.', 5)
on conflict (code) do update set name = excluded.name, price = excluded.price, perishable = excluded.perishable, why = excluded.why, sort = excluded.sort;
alter table public.basket_choices enable row level security;
drop policy if exists p_choices_read on public.basket_choices;
create policy p_choices_read on public.basket_choices for select using (auth.uid() is not null);
drop policy if exists p_choices_admin on public.basket_choices;
create policy p_choices_admin on public.basket_choices for all using (public.is_admin()) with check (public.is_admin());

-- ---------- pre-orders ----------
-- Core basket (eggs, lentils, greens, small fish) is always included: BDT 280. Up to 3 extra items.
-- Deposit: BDT 40, only when a perishable item is chosen and the family has fewer than 3 pickups.
-- The deposit is the first instalment of the price, never an extra charge.
-- Pickup is on Friday; orders for a Friday close on Wednesday night.
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  mother_id uuid not null references public.mothers(id) on delete cascade,
  shop_id uuid references public.profiles(id),
  pickup_date date not null default current_date,
  items jsonb not null default '[]',
  total int not null default 280,
  deposit int not null default 0,
  deposit_method text,
  deposit_ref text,
  status text not null default 'confirmed' check (status in ('awaiting_deposit','confirmed','picked_up','missed','cancelled')),
  source text not null default 'family' check (source in ('family','call','maa_bondhu')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists orders_one_per_week on public.orders (mother_id, pickup_date) where status <> 'cancelled';

create or replace function public.next_pickup() returns date language sql stable as $$
  select d + ((5 - extract(dow from d)::int + 7) % 7) + case when extract(dow from d) in (4, 5) then 7 else 0 end
  from (select (now() at time zone 'Asia/Dhaka')::date d) t $$;

create or replace function public.prepare_order() returns trigger language plpgsql security definer set search_path = public as $$
declare v_shop uuid; v_items jsonb; v_sum int; v_per boolean; v_n int; v_done int; r text := public.my_role();
begin
  select shop_id into v_shop from public.mothers where id = new.mother_id;
  if v_shop is null then raise exception 'No Pushti Basket shop is assigned to this mother yet. Ask her Maa Bondhu.'; end if;
  new.shop_id := v_shop;
  select coalesce(jsonb_agg(jsonb_build_object('code', c.code, 'name', c.name, 'price', c.price, 'perishable', c.perishable) order by c.sort), '[]'::jsonb),
         coalesce(sum(c.price), 0), coalesce(bool_or(c.perishable), false), count(*)
    into v_items, v_sum, v_per, v_n
  from public.basket_choices c
  where c.active and c.code in (select jsonb_array_elements_text(case when jsonb_typeof(new.items) = 'array' then new.items else '[]'::jsonb end));
  if v_n > 3 then raise exception 'Choose up to 3 extra items.'; end if;
  new.items := v_items; new.total := 280 + v_sum;
  if auth.uid() is null then return new; end if;   -- SQL Editor (demo data) keeps the given date and status
  select count(*) into v_done from public.orders where mother_id = new.mother_id and status = 'picked_up';
  new.deposit := case when v_per and v_done < 3 then 40 else 0 end;
  new.status := case when new.deposit > 0 then 'awaiting_deposit' else 'confirmed' end;
  new.pickup_date := public.next_pickup();
  new.source := case when r = 'family' then 'family' when new.source = 'call' then 'call' else 'maa_bondhu' end;
  new.created_by := auth.uid(); new.created_at := now(); new.updated_at := now();
  new.deposit_method := null; new.deposit_ref := null;
  if exists (select 1 from public.orders where mother_id = new.mother_id and pickup_date = new.pickup_date and status <> 'cancelled') then
    raise exception 'A basket is already ordered for Friday %. Cancel it first to change it.', to_char(new.pickup_date, 'DD Mon');
  end if;
  return new;
end $$;
drop trigger if exists t_prepare_order on public.orders;
create trigger t_prepare_order before insert on public.orders for each row execute function public.prepare_order();

create or replace function public.guard_order() returns trigger language plpgsql security definer set search_path = public as $$
declare r text := public.my_role();
begin
  if auth.uid() is null then return new; end if;
  new.id := old.id; new.mother_id := old.mother_id; new.shop_id := old.shop_id; new.items := old.items; new.total := old.total;
  new.deposit := old.deposit; new.pickup_date := old.pickup_date; new.source := old.source;
  new.created_by := old.created_by; new.created_at := old.created_at; new.updated_at := now();
  if r = 'shopkeeper' then new.deposit_ref := old.deposit_ref; new.deposit_method := coalesce(old.deposit_method, new.deposit_method); end if;
  if old.status <> 'awaiting_deposit' then new.deposit_ref := old.deposit_ref; new.deposit_method := old.deposit_method; end if;
  if new.status is distinct from old.status then
    if old.status in ('picked_up','missed','cancelled') then raise exception 'This order is already closed.'; end if;
    if new.status = 'cancelled' then
      if r = 'shopkeeper' then raise exception 'Only the family or Maa Bondhu can cancel an order.'; end if;
      if old.status = 'confirmed' and old.deposit > 0 then raise exception 'The deposit is already paid. Ask the Maa Bondhu or the shop.'; end if;
      if r = 'family' and (now() at time zone 'Asia/Dhaka')::date > old.pickup_date - 2 then raise exception 'Orders for this Friday closed on Wednesday night.'; end if;
    elsif new.status = 'confirmed' then
      if r not in ('shopkeeper','admin') or old.status <> 'awaiting_deposit' then raise exception 'Only the shop confirms that the deposit was received.'; end if;
    elsif new.status in ('picked_up','missed') then
      if r not in ('shopkeeper','admin') then raise exception 'Only the shop marks pickups.'; end if;
      if new.status = 'picked_up' and old.status <> 'confirmed' then raise exception 'Confirm the deposit before handing over the basket.'; end if;
    else raise exception 'Invalid order status.'; end if;
  end if;
  return new;
end $$;
drop trigger if exists t_guard_order on public.orders;
create trigger t_guard_order before update on public.orders for each row execute function public.guard_order();

-- Deposit becomes the first payment; pickup adds the basket to the khata; a missed pickup asks the Maa Bondhu to check on her.
create or replace function public.order_effects() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is not distinct from old.status or auth.uid() is null then return new; end if;
  if new.status = 'confirmed' and old.status = 'awaiting_deposit' and new.deposit > 0 then
    insert into public.sales (mother_id, shop_id, kind, amount, method) values (new.mother_id, new.shop_id, 'payment', new.deposit, coalesce(new.deposit_method, 'Cash'));
  elsif new.status = 'picked_up' then
    insert into public.sales (mother_id, shop_id, kind, amount) values (new.mother_id, new.shop_id, 'basket', new.total);
  elsif new.status = 'missed' then
    insert into public.alerts (mother_id, sign, note, source) values (new.mother_id, 'Missed basket pickup',
      'Please check on her. Any deposit stays as credit for her next basket.', 'shop');
  end if;
  return new;
end $$;
drop trigger if exists t_order_effects on public.orders;
create trigger t_order_effects after update on public.orders for each row execute function public.order_effects();

alter table public.orders enable row level security;
drop policy if exists p_orders_read on public.orders;
create policy p_orders_read on public.orders for select using (
  public.is_admin() or mother_id = public.my_mother() or public.is_my_mother(mother_id)
  or (shop_id = auth.uid() and public.my_role() = 'shopkeeper'));
drop policy if exists p_orders_insert on public.orders;
create policy p_orders_insert on public.orders for insert with check (
  public.is_admin() or mother_id = public.my_mother() or public.is_my_mother(mother_id));
drop policy if exists p_orders_update on public.orders;
create policy p_orders_update on public.orders for update using (
  public.is_admin() or mother_id = public.my_mother() or public.is_my_mother(mother_id)
  or (shop_id = auth.uid() and public.my_role() = 'shopkeeper'))
  with check (true);

grant execute on function public.my_mother(), public.is_my_mother(uuid), public.family_contacts(), public.next_pickup() to authenticated;
grant select, insert, update on public.orders to authenticated;
grant select on public.basket_choices to authenticated;

do $$ begin
  begin alter publication supabase_realtime add table public.orders; exception when others then null; end;
end $$;

select 'Update 3 done' as result;
