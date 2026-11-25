-- MaaPushti database: run this whole file once in Supabase > SQL Editor.
-- Roles: admin, maa_bondhu, shopkeeper, doctor. Every table is protected by row-level security (RLS):
-- a Maa Bondhu sees only her own mothers, a shopkeeper only the families assigned to their shop,
-- a doctor only the mothers in consultations sent to them.


-- ---------- tables ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','maa_bondhu','shopkeeper','doctor')),
  full_name text not null,
  phone text not null unique,
  area text,                 -- short location label, e.g. "Betka, Tongibari"
  division text, district text, upazila text, union_name text,
  contact_phone text,        -- number others call; the login phone never changes
  alt_phone text,
  photo text,                -- small profile photo (data URL)
  shop_name text,            -- shopkeepers
  specialty text,            -- doctors
  hospital text,             -- doctors
  bmdc_no text,              -- doctors: registration number
  available boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.mothers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  age int,
  village text not null,
  union_name text,
  edd date not null,         -- expected delivery date; pregnancy week is calculated from it
  husband_name text, husband_phone text,
  mil_name text, mil_phone text,  -- mother-in-law
  gravida int,               -- number of pregnancies including this one
  risk_notes text,
  next_checkup date,
  maa_bondhu_id uuid not null references public.profiles(id),
  shop_id uuid references public.profiles(id),
  consent boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  mother_id uuid not null references public.mothers(id) on delete cascade,
  sign text not null,
  note text,
  source text not null default 'call',   -- call | visit | voice
  status text not null default 'open' check (status in ('open','visited')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.activity (
  id uuid primary key default gen_random_uuid(),
  mother_id uuid not null references public.mothers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) default auth.uid(),
  kind text not null check (kind in ('call','visit','note','checkup')),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  mother_id uuid not null references public.mothers(id) on delete cascade,
  shop_id uuid not null references public.profiles(id) default auth.uid(),
  kind text not null check (kind in ('basket','payment')),
  amount int not null default 0,
  method text,
  created_at timestamptz not null default now()
);

create table if not exists public.consultations (
  id uuid primary key default gen_random_uuid(),
  mother_id uuid not null references public.mothers(id) on delete cascade,
  maa_bondhu_id uuid not null references public.profiles(id) default auth.uid(),
  doctor_id uuid not null references public.profiles(id),
  mode text not null default 'video' check (mode in ('video','audio')),
  room text not null,
  reason text,
  status text not null default 'requested' check (status in ('requested','active','done','declined')),
  doctor_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- helper functions (security definer so policies don't loop) ----------
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as
$$ select role from public.profiles where id = auth.uid() and active $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(public.my_role() = 'admin', false) $$;

create or replace function public.can_see_mother(m uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select public.is_admin()
   or exists (select 1 from public.mothers where id = m and maa_bondhu_id = auth.uid() and public.my_role() = 'maa_bondhu')
   or exists (select 1 from public.consultations where mother_id = m and doctor_id = auth.uid() and public.my_role() = 'doctor') $$;

create or replace function public.is_shop_customer(m uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.mothers where id = m and shop_id = auth.uid()) and public.my_role() = 'shopkeeper' $$;

-- Shopkeepers see only name and village of the families assigned to their shop (no phone or health data).
create or replace function public.shop_customers()
returns table (id uuid, full_name text, village text)
language sql stable security definer set search_path = public as
$$ select m.id, m.full_name, m.village from public.mothers m
   where m.shop_id = auth.uid() and public.my_role() = 'shopkeeper' order by m.full_name $$;

-- ---------- row-level security ----------
alter table public.profiles enable row level security;
alter table public.mothers enable row level security;
alter table public.alerts enable row level security;
alter table public.activity enable row level security;
alter table public.sales enable row level security;
alter table public.consultations enable row level security;

drop policy if exists p_profiles_read on public.profiles;
create policy p_profiles_read on public.profiles for select using (
  id = auth.uid() or public.is_admin()
  or (public.my_role() = 'maa_bondhu' and role in ('doctor','shopkeeper') and active)
  or (public.my_role() = 'doctor' and id in (select maa_bondhu_id from public.consultations where doctor_id = auth.uid())));
drop policy if exists p_profiles_admin on public.profiles;
create policy p_profiles_admin on public.profiles for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists p_profiles_self on public.profiles;
create policy p_profiles_self on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- The login phone and user ID never change. Only the admin changes role, access and location.
create or replace function public.guard_profile() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.id := old.id; new.phone := old.phone; new.created_at := old.created_at;
  if not public.is_admin() then
    new.role := old.role; new.active := old.active; new.area := old.area;
    new.division := old.division; new.district := old.district; new.upazila := old.upazila; new.union_name := old.union_name;
  end if;
  return new;
end $$;
drop trigger if exists t_guard_profile on public.profiles;
create trigger t_guard_profile before update on public.profiles for each row execute function public.guard_profile();

drop policy if exists p_mothers_read on public.mothers;
create policy p_mothers_read on public.mothers for select using (
  public.is_admin()
  or (public.my_role() = 'maa_bondhu' and maa_bondhu_id = auth.uid())
  or (public.my_role() = 'doctor' and exists (select 1 from public.consultations c where c.mother_id = mothers.id and c.doctor_id = auth.uid())));
drop policy if exists p_mothers_insert on public.mothers;
create policy p_mothers_insert on public.mothers for insert with check (
  public.is_admin() or (public.my_role() = 'maa_bondhu' and maa_bondhu_id = auth.uid()));
drop policy if exists p_mothers_update on public.mothers;
create policy p_mothers_update on public.mothers for update using (
  public.is_admin() or (public.my_role() = 'maa_bondhu' and maa_bondhu_id = auth.uid()))
  with check (public.is_admin() or (public.my_role() = 'maa_bondhu' and maa_bondhu_id = auth.uid()));
drop policy if exists p_mothers_delete on public.mothers;
create policy p_mothers_delete on public.mothers for delete using (public.is_admin());

drop policy if exists p_alerts_all on public.alerts;
create policy p_alerts_all on public.alerts for all using (public.can_see_mother(mother_id)) with check (public.can_see_mother(mother_id));

drop policy if exists p_activity_read on public.activity;
create policy p_activity_read on public.activity for select using (public.can_see_mother(mother_id));
drop policy if exists p_activity_insert on public.activity;
create policy p_activity_insert on public.activity for insert with check (user_id = auth.uid() and public.can_see_mother(mother_id));

drop policy if exists p_sales_read on public.sales;
create policy p_sales_read on public.sales for select using (
  shop_id = auth.uid() or public.is_admin()
  or exists (select 1 from public.mothers m where m.id = mother_id and m.maa_bondhu_id = auth.uid()));
drop policy if exists p_sales_insert on public.sales;
create policy p_sales_insert on public.sales for insert with check (
  shop_id = auth.uid() and public.is_shop_customer(mother_id));

drop policy if exists p_consult_read on public.consultations;
create policy p_consult_read on public.consultations for select using (
  public.is_admin() or maa_bondhu_id = auth.uid() or doctor_id = auth.uid());
drop policy if exists p_consult_insert on public.consultations;
create policy p_consult_insert on public.consultations for insert with check (
  maa_bondhu_id = auth.uid() and public.my_role() = 'maa_bondhu'
  and exists (select 1 from public.mothers m where m.id = mother_id and m.maa_bondhu_id = auth.uid())
  and exists (select 1 from public.profiles d where d.id = doctor_id and d.role = 'doctor'));
drop policy if exists p_consult_update on public.consultations;
create policy p_consult_update on public.consultations for update using (
  public.is_admin() or maa_bondhu_id = auth.uid() or doctor_id = auth.uid())
  with check (public.is_admin() or maa_bondhu_id = auth.uid() or doctor_id = auth.uid());

grant execute on function public.shop_customers() to authenticated;

-- Live updates for doctors' consultation requests and new alerts.
do $$ begin
  begin alter publication supabase_realtime add table public.consultations; exception when others then null; end;
  begin alter publication supabase_realtime add table public.alerts; exception when others then null; end;
end $$;

-- ---------- first admin ----------
-- 1. Supabase > Authentication > Users > Add user: email = <your phone>@maapushti.app (e.g. 01700000000@maapushti.app),
--    choose a password, tick "Auto Confirm User".
-- 2. Then run the line below with your phone and name:
-- insert into public.profiles (id, role, full_name, phone)
--   select id, 'admin', 'Riyad Hossain', '01700000000' from auth.users where email = '01700000000@maapushti.app';
