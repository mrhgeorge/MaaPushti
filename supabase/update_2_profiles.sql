-- MaaPushti update 2: location (division to union), contact numbers and profile photo.
-- Run this once in Supabase > SQL Editor. Safe to run again.
alter table public.profiles
  add column if not exists division text,
  add column if not exists district text,
  add column if not exists upazila text,
  add column if not exists union_name text,
  add column if not exists contact_phone text,
  add column if not exists alt_phone text,
  add column if not exists photo text;

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
