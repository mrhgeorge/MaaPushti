# MaaPushti: setup guide

MaaPushti runs as a website on **GitHub Pages**, with logins and data in **Supabase** (free plan). Setup takes about 20 minutes.

Until you connect Supabase, the site runs in **test mode**: sample data stays in each browser, and these logins work (password `demo1234`):

| Role | Phone |
|---|---|
| Admin | 01700000000 |
| Maa Bondhu | 01711111111, 01722222222 |
| Shopkeeper | 01733333333 |
| Gynecologist | 01744444444 |
| Family (Shirin's husband) | 01766666666 |

## 1. Put the site on GitHub Pages

1. Sign in at github.com and click **New repository**. Name it `maapushti`, set it to **Public**, and create it.
2. Click **uploading an existing file**, then drag in **everything from this folder**, including the `vendor` and `supabase` folders. Click **Commit changes**.
3. Go to **Settings > Pages**. Under *Branch*, choose `main` and `/ (root)`, then **Save**.
4. After about a minute, the site is live at `https://<your-username>.github.io/maapushti/`.

## 2. Create the Supabase database

1. Sign up at supabase.com and create a **New project**, choosing the Singapore region (closest to Bangladesh). Save the database password somewhere safe.
2. Open **SQL Editor > New query**, paste the whole of `supabase/schema.sql`, and click **Run**. It should say *Success*.
3. Go to **Authentication > Sign In / Providers > Email** and turn **Confirm email** OFF, then save. This is needed because the admin creates logins for people who may not have email.

## 3. Create your admin login

1. Go to **Authentication > Users > Add user > Create new user**.
   - Email: your phone number followed by `@maapushti.app`, for example `01700000000@maapushti.app`
   - Password: your choice
   - Tick **Auto Confirm User**
2. In the **SQL Editor**, run this line, changing the phone number and name:

```sql
insert into public.profiles (id, role, full_name, phone)
select id, 'admin', 'Riyad Hossain', '01700000000' from auth.users where email = '01700000000@maapushti.app';
```

## 4. Connect the site to Supabase

1. In Supabase, open **Project Settings > API** and copy the **Project URL** and the **anon public** key.
2. In GitHub, open `config.js`, click the pencil icon to edit, and paste them in:

```js
SUPABASE_URL: "https://xxxx.supabase.co",
SUPABASE_ANON_KEY: "eyJ...",
```

3. Click **Commit changes**. After about a minute, reload the site. The yellow test-mode bar disappears, and you sign in with your admin phone and password.

The anon key is meant to be public. Security comes from the database rules in `schema.sql`, not from hiding the key. Never put the **service_role** key in the site.

## Updates

If you set up the database before 25 Nov 2026, run `supabase/update_2_profiles.sql` once in the SQL Editor. It adds division to union, contact numbers and profile photos.

If you set up the database before 27 Nov 2026, run `supabase/update_3_family_orders.sql` once. It adds:

- **Family logins.** A Maa Bondhu (or the admin) creates them from a mother's page, with her consent. The family sees her pregnancy week, checkups, doctor's advice and khata, can report a danger sign, and orders her basket.
- **Choose-your-basket.** The core foods (eggs, lentils, greens, small fish, BDT 280) are always included. The family adds up to 3 extras: peanuts, chickpeas, dates, extra eggs, or the Pushti Plus fruit pack. Prices are set in the `basket_choices` table.
- **Pre-orders with a deposit.** Pickup is on Friday; orders close on Wednesday night. A BDT 40 deposit is asked only when fresh fruit is chosen, until the family has picked up 3 baskets. The deposit is the first instalment, not an extra charge. A missed pickup alerts the Maa Bondhu, and the deposit stays as credit.
- Mothers without a literate family member choose by keypad on the weekly call, or the Maa Bondhu orders for them.

Then run `supabase/demo_data_3.sql` for sample family logins (husbands, 01998000001, 01998000006, 01998000011, 01998000016, 01998000021, password `demo1234`) and this week's orders.

## 5. Add people

Sign in as admin, open **Users** and create logins for each Maa Bondhu, shopkeeper and gynecologist. Each person signs in with their phone number and the password you set. **Turn off** removes someone's access at once.

## What each role can see

| Role | Can see and do |
|---|---|
| Admin | Everything: users, all mothers, reassigning Maa Bondhus and shops |
| Maa Bondhu | Only the mothers she registered or was assigned. Can call them, raise alerts and start doctor calls |
| Shopkeeper | Only the name and village of families assigned to their shop. No phone numbers or health data |
| Gynecologist | Only mothers in consultations sent to them, plus their own profile |

These rules are enforced by the database itself (row-level security), so they hold even if someone edits the web page.

## Calling

- **Call mother / husband / doctor** opens your phone's dialer with the number filled in.
  - On an Android or iPhone browser, the call goes out from that phone.
  - On a Windows laptop, link your phone with the **Phone Link** app. The laptop then places the call through your phone.
  - On a Mac, use an iPhone with **Calls on Other Devices** turned on.
- **Video or audio consultations** open a free **Jitsi Meet** room in a new tab. The doctor joins the same room from her Requests page. On meet.jit.si, the first person to join may be asked to sign in with Google, GitHub or Facebook to start the meeting.

## Files

| File | What it does |
|---|---|
| `index.html` | Page and styles |
| `app.js` | All screens |
| `api.js` | Talks to Supabase, or to sample data in test mode |
| `config.js` | Your Supabase URL and key |
| `vendor/` | Supabase library, stored locally so no extra download is needed |
| `supabase/schema.sql` | Database tables and security rules |
