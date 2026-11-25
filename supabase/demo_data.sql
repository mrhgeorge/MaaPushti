-- MaaPushti demo data: 5 Maa Bondhus, 7 shopkeepers, 5 gynecologists, 25 mothers. Password for all: demo1234
-- Safe to run again: it replaces the earlier demo data.
alter table public.profiles add column if not exists division text, add column if not exists district text, add column if not exists upazila text,
  add column if not exists union_name text, add column if not exists contact_phone text, add column if not exists alt_phone text, add column if not exists photo text;

do $$
declare v_u record; v_uid uuid; v_m record; v_n int; v_i int; v_amt int;
begin
  create temp table demo_users (role text, name text, phone text, upz text, un text, shop text, spec text, hosp text, avail boolean) on commit drop;
  insert into demo_users values
   ('maa_bondhu','Rahima Begum','01710000001','Tongibari','Betka',null,null,null,true),
   ('maa_bondhu','Salma Akter','01710000002','Tongibari','Abdullapur',null,null,null,true),
   ('maa_bondhu','Nurjahan Khatun','01710000003','Tongibari','Autshahi',null,null,null,true),
   ('maa_bondhu','Shirin Sultana','01710000004','Tongibari','Dighirpar',null,null,null,true),
   ('maa_bondhu','Kohinoor Begum','01710000005','Tongibari','Hasailbanari',null,null,null,true),
   ('shopkeeper','Abdul Karim','01720000001','Tongibari','Betka','Karim Store, Betka Bazar',null,null,true),
   ('shopkeeper','Mizanur Rahman','01720000002','Tongibari','Betka','Mizan General Store, Betka',null,null,true),
   ('shopkeeper','Jahangir Alam','01720000003','Tongibari','Abdullapur','Alam Bhandar, Abdullapur',null,null,true),
   ('shopkeeper','Delwar Hossain','01720000004','Tongibari','Autshahi','Delwar Store, Autshahi Bazar',null,null,true),
   ('shopkeeper','Habibur Rahman','01720000005','Tongibari','Autshahi','Habib Traders, Autshahi',null,null,true),
   ('shopkeeper','Nazrul Islam','01720000006','Tongibari','Dighirpar','Nazrul Store, Dighirpar',null,null,true),
   ('shopkeeper','Shahidul Islam','01720000007','Tongibari','Hasailbanari','Shahid Bhandar, Hasail',null,null,true),
   ('doctor','Dr. Nasrin Sultana','01730000001','Munshiganj Sadar',null,null,'Gynecologist and obstetrician','Munshiganj 250-Bed General Hospital',true),
   ('doctor','Dr. Farhana Islam','01730000002','Tongibari',null,null,'Gynecologist','Tongibari Upazila Health Complex',true),
   ('doctor','Dr. Rokeya Haque','01730000003','Sreenagar',null,null,'Obstetrician and gynecologist','Sreenagar Upazila Health Complex',false),
   ('doctor','Dr. Tahmina Akter','01730000004','Lohajang',null,null,'Maternal and fetal medicine','Lohajang Upazila Health Complex',true),
   ('doctor','Dr. Shamima Nasreen','01730000005','Sirajdikhan',null,null,'Gynecologist and obstetrician','Sirajdikhan Upazila Health Complex',true);

  -- remove earlier demo copy
  delete from public.mothers where phone like '019990%' or maa_bondhu_id in (select p.id from public.profiles p join demo_users d on d.phone = p.phone);
  delete from public.profiles where phone in (select phone from demo_users);
  delete from auth.users where email in (select phone || '@maapushti.app' from demo_users);

  for v_u in select * from demo_users loop
    v_uid := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', v_u.phone || '@maapushti.app',
      extensions.crypt('demo1234', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_uid, v_uid::text, jsonb_build_object('sub', v_uid::text, 'email', v_u.phone || '@maapushti.app', 'email_verified', true), 'email', now(), now(), now());
    insert into public.profiles (id, role, full_name, phone, contact_phone, division, district, upazila, union_name, area, shop_name, specialty, hospital, bmdc_no, available)
    values (v_uid, v_u.role, v_u.name, v_u.phone, v_u.phone, 'Dhaka', 'Munshiganj', v_u.upz, v_u.un, coalesce(v_u.un || ', ', '') || v_u.upz, v_u.shop, v_u.spec, v_u.hosp,
      case when v_u.role = 'doctor' then 'A-' || (40000 + floor(random() * 29999))::int end, v_u.avail);
  end loop;

  -- mothers: Maa Bondhu phone, name, phone, age, pregnancy no., week, village, husband, risk, next checkup in days, shop phone
  create temp table demo_m (mbp text, name text, phone text, age int, grav int, wk int, vil text, hus text, risk text, nc int, shp text) on commit drop;
  insert into demo_m values
   ('01710000001','Shirin Akter','01999000001',24,1,24,'Betka','Jamal Hossain',null,4,'01720000001'),
   ('01710000001','Rokeya Begum','01999000002',29,3,31,'Purba Betka','Abul Kalam','Previous caesarean',-3,'01720000002'),
   ('01710000001','Nasima Khatun','01999000003',19,1,12,'Kalikapur','Sohel Rana','First pregnancy at 19',9,'01720000001'),
   ('01710000001','Jesmin Akter','01999000004',26,2,34,'Betka','Kamal Uddin',null,-6,'01720000002'),
   ('01710000001','Laboni Akter','01999000005',22,1,18,'Kalikapur','Rasel Mia',null,12,null),
   ('01710000002','Moriom Akter','01999000006',27,2,36,'Abdullapur','Alamgir Hossain','High blood pressure in last pregnancy',2,'01720000003'),
   ('01710000002','Taslima Begum','01999000007',23,1,9,'Chhota Kalai','Faruk Ahmed',null,-2,'01720000003'),
   ('01710000002','Sumi Akter','01999000008',21,1,28,'Abdullapur','Jewel Rana','Anaemia (Hb 9.5)',5,'01720000003'),
   ('01710000002','Farzana Yasmin','01999000009',30,3,15,'Chhota Kalai','Mostafa Kamal',null,7,'01720000003'),
   ('01710000002','Rupa Begum','01999000010',25,2,38,'Abdullapur','Sujon Mia',null,1,null),
   ('01710000003','Khadija Akter','01999000011',20,1,26,'Autshahi','Babul Hossain',null,9,'01720000004'),
   ('01710000003','Hosneara Begum','01999000012',33,4,32,'Baghia','Shafiqul Islam','Age 33, fourth pregnancy',-4,'01720000005'),
   ('01710000003','Mitu Akter','01999000013',22,1,7,'Dhipur','Rubel Hossain',null,14,'01720000004'),
   ('01710000003','Shapla Begum','01999000014',28,2,20,'Autshahi','Anwar Hossain',null,3,'01720000005'),
   ('01710000003','Sharmin Akter','01999000015',24,2,37,'Baghia','Monir Hossain',null,2,null),
   ('01710000004','Asma Khatun','01999000016',26,2,29,'Dighirpar','Nur Islam','Swelling in last pregnancy',4,'01720000006'),
   ('01710000004','Bilkis Begum','01999000017',31,3,14,'Kamarkhara','Shahjahan Mia',null,-5,'01720000006'),
   ('01710000004','Tania Akter','01999000018',19,1,22,'Joslong','Sabbir Hossain','Low weight (41 kg)',6,'01720000006'),
   ('01710000004','Ruma Akter','01999000019',27,2,39,'Dighirpar','Masud Rana',null,1,'01720000006'),
   ('01710000004','Parvin Akter','01999000020',23,1,11,'Kamarkhara','Hasan Ali',null,20,null),
   ('01710000005','Morjina Begum','01999000021',29,3,33,'Hasail','Abdur Rahim','Twin pregnancy',2,'01720000007'),
   ('01710000005','Selina Akter','01999000022',21,1,17,'Banari','Kawsar Ahmed',null,-3,'01720000007'),
   ('01710000005','Ayesha Siddika','01999000023',25,2,27,'Panchgaon','Mamun Hossain',null,8,'01720000007'),
   ('01710000005','Popi Akter','01999000024',20,1,8,'Hasail','Shuvo Mia',null,-1,'01720000007'),
   ('01710000005','Rabeya Khatun','01999000025',30,2,35,'Banari','Liton Mia','Previous stillbirth',3,null);
  insert into public.mothers (full_name, phone, age, village, union_name, edd, husband_name, husband_phone, mil_name, gravida, risk_notes, next_checkup, maa_bondhu_id, shop_id, consent, created_at)
  select d.name, d.phone, d.age, d.vil, mb.union_name, current_date + (40 - d.wk) * 7, d.hus, '01998' || right(d.phone, 6),
    (array['Amena Begum','Jahanara Begum','Saleha Khatun','Rahela Begum','Momena Khatun'])[1 + right(d.phone, 1)::int % 5],
    d.grav, d.risk, current_date + d.nc, mb.id, s.id, true, now() - (20 + d.wk) * interval '1 day'
  from demo_m d join public.profiles mb on mb.phone = d.mbp left join public.profiles s on s.phone = d.shp;

  -- danger signs: 9 open, 3 already visited
  insert into public.alerts (mother_id, sign, note, source, status, created_at, resolved_at)
  select m.id, a.sign, a.note, a.src, a.st, now() - a.mins * interval '1 minute', case when a.st = 'visited' then now() - interval '1 day' end
  from (values
   ('01999000002','Swelling of hands, feet or face','Feet and face swollen since yesterday','call','open',95),
   ('01999000004','Baby moving less',null,'call','open',620),
   ('01999000006','Severe headache or fits','Headache with blurred vision','call','open',40),
   ('01999000008','Fever',null,'visit','open',1300),
   ('01999000012','Swelling of hands, feet or face',null,'call','open',300),
   ('01999000016','Swelling of hands, feet or face','Swelling getting worse','visit','open',180),
   ('01999000019','Bleeding','Light spotting this morning','call','open',75),
   ('01999000021','Baby moving less','Twins, movement felt less today','call','open',25),
   ('01999000025','Severe headache or fits',null,'call','open',900),
   ('01999000001','Fever','Mild fever, gave advice, better next day','call','visited',8000),
   ('01999000015','Baby moving less','Movement normal after rest','call','visited',6000),
   ('01999000010','Swelling of hands, feet or face','Checked at clinic, BP normal','call','visited',5000)
  ) a(ph, sign, note, src, st, mins) join public.mothers m on m.phone = a.ph;

  -- visits and calls for every other mother
  insert into public.activity (mother_id, user_id, kind, note, created_at)
  select m.id, m.maa_bondhu_id, (array['visit','call','visit','checkup','visit'])[1 + k % 5],
    (array['Home visit. Eating eggs most days, taking iron tablets.','Phone call. Family buying the Pushti Basket weekly.',
           'Home visit. Mother-in-law agreed she should eat with the family.','Checkup done at community clinic. Weight gain normal.',
           'Home visit. Advised rest on left side and more water.'])[1 + k % 5], now() - (1 + k % 9) * interval '1 day'
  from (select *, row_number() over (order by phone) k from public.mothers where phone like '019990%') m where k % 2 = 1;

  -- Pushti Basket sales and instalments
  for v_m in select * from public.mothers where phone like '019990%' and shop_id is not null loop
    v_n := 1 + floor(random() * 4)::int;
    for v_i in 1..v_n loop
      insert into public.sales (mother_id, shop_id, kind, amount, created_at) values (v_m.id, v_m.shop_id, 'basket', 0, now() - (7 * (v_n - v_i + 1)) * interval '1 day');
    end loop;
    v_amt := (floor(random() * 5)::int * 70) * v_n / 2;
    while v_amt > 0 loop
      v_i := least(v_amt, (array[40,70,140])[1 + floor(random() * 3)::int]);
      insert into public.sales (mother_id, shop_id, kind, amount, method, created_at)
      values (v_m.id, v_m.shop_id, 'payment', v_i, (array['bKash','Nagad','Cash'])[1 + floor(random() * 3)::int], now() - (1 + floor(random() * 20)) * interval '1 day');
      v_amt := v_amt - v_i;
    end loop;
  end loop;

  -- doctor consultations: 3 finished with advice, 3 waiting on doctors' dashboards
  insert into public.consultations (mother_id, maa_bondhu_id, doctor_id, mode, room, reason, status, doctor_notes, created_at)
  select m.id, m.maa_bondhu_id, d.id, c.mode, 'MaaPushti-' || substr(md5(random()::text), 1, 10), c.reason, c.st, c.adv, now() - c.mins * interval '1 minute'
  from (values
   ('01999000002','01730000001','done','video','Swelling and headache at 31 weeks','Check blood pressure today. If above 140/90, refer to Upazila Health Complex.',1500),
   ('01999000006','01730000002','done','audio','BP was high in last pregnancy, now 36 weeks','Plan delivery at the health complex. Check BP twice a week.',2900),
   ('01999000018','01730000004','done','video','Low weight, 22 weeks','Add one extra meal daily, continue iron and calcium. Weigh again in 2 weeks.',4000),
   ('01999000021','01730000001','requested','video','Twin pregnancy, baby moving less today',null,20),
   ('01999000008','01730000002','requested','audio','Fever for two days at 28 weeks',null,55),
   ('01999000019','01730000005','requested','video','Light spotting at 39 weeks',null,70)
  ) c(ph, dph, st, mode, reason, adv, mins) join public.mothers m on m.phone = c.ph join public.profiles d on d.phone = c.dph;
end $$;

select role, count(*) from public.profiles group by role order by role;
