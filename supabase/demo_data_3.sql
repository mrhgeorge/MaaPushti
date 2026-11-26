-- MaaPushti demo data for update 3: family logins and this week's basket pre-orders.
-- Run AFTER update_3_family_orders.sql and demo_data.sql. Safe to run again. Password for all: demo1234
do $$
declare v_f record; v_uid uuid; v_pd date := public.next_pickup();
begin
  -- family logins: one husband for each Maa Bondhu's first mother
  delete from public.orders where mother_id in (select id from public.mothers where phone like '019990%');
  delete from public.profiles where role = 'family' and phone like '019980%';
  delete from auth.users where email like '019980%@maapushti.app';
  for v_f in select m.id, m.husband_name, m.husband_phone from public.mothers m
             where m.phone in ('01999000001','01999000006','01999000011','01999000016','01999000021') loop
    v_uid := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', v_f.husband_phone || '@maapushti.app',
      extensions.crypt('demo1234', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_uid, v_uid::text, jsonb_build_object('sub', v_uid::text, 'email', v_f.husband_phone || '@maapushti.app', 'email_verified', true), 'email', now(), now(), now());
    insert into public.profiles (id, role, full_name, phone, contact_phone, mother_id, relation)
    values (v_uid, 'family', v_f.husband_name, v_f.husband_phone, v_f.husband_phone, v_f.id, 'Husband');
  end loop;

  -- Shirin's family has picked up 3 baskets, so they no longer need a deposit
  insert into public.orders (mother_id, items, pickup_date, status, source, created_at)
  select m.id, o.items::jsonb, v_pd - o.wk * 7, 'picked_up', 'family', now() - (o.wk * 7 + 4) * interval '1 day'
  from public.mothers m, (values ('["peanuts"]', 4), ('[]', 3), ('["dates"]', 2)) o(items, wk) where m.phone = '01999000001';

  -- this Friday's orders
  insert into public.orders (mother_id, items, pickup_date, status, deposit, deposit_method, deposit_ref, source, created_at)
  select m.id, o.items::jsonb, v_pd, o.st, o.dep, o.meth, o.ref, o.src, now() - o.hrs * interval '1 hour'
  from (values
    ('01999000001','["peanuts","fruit"]','confirmed',0,null,null,'family',20),
    ('01999000002','["fruit"]','awaiting_deposit',40,'bKash','BK8KD2XQ7','maa_bondhu',30),
    ('01999000003','[]','confirmed',0,null,null,'call',26),
    ('01999000004','["chickpeas","eggs4"]','confirmed',0,null,null,'call',8),
    ('01999000006','["fruit","dates"]','awaiting_deposit',40,null,null,'family',5),
    ('01999000008','["eggs4"]','confirmed',0,null,null,'maa_bondhu',40),
    ('01999000011','["peanuts"]','confirmed',0,null,null,'family',12),
    ('01999000012','["fruit"]','awaiting_deposit',40,'Nagad','NG55T1Q','call',3),
    ('01999000016','[]','confirmed',0,null,null,'family',50),
    ('01999000021','["eggs4","fruit"]','awaiting_deposit',40,null,null,'family',2),
    ('01999000023','[]','confirmed',0,null,null,'call',16)
  ) o(ph, items, st, dep, meth, ref, src, hrs) join public.mothers m on m.phone = o.ph;
end $$;

select 'family logins' as what, count(*) from public.profiles where role = 'family'
union all select 'orders for ' || to_char(public.next_pickup(), 'DD Mon'), count(*) from public.orders where pickup_date = public.next_pickup();
