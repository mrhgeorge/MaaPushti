// MaaPushti data layer. Same functions in two modes:
//  - Supabase mode (config.js filled): real logins and a shared database protected by row-level security.
//  - Test mode (config.js empty): sample data kept in this browser, with the same role rules applied here.
(function () {
  const CFG = window.MAAPUSHTI_CONFIG || {};
  const toEmail = p => String(p).replace(/\D/g, "") + "@" + (CFG.LOGIN_DOMAIN || "maapushti.app");
  const room = () => "MaaPushti-" + Array.from(crypto.getRandomValues(new Uint8Array(6))).map(b => b.toString(36).padStart(2, "0")).join("").slice(0, 10);
  const nowIso = () => new Date().toISOString();

  // ---------------- Supabase mode ----------------
  function supabaseApi() {
    const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
    let me = null;
    const chk = r => { if (r.error) throw new Error(r.error.message); return r.data; };
    async function loadMe() {
      const { data } = await sb.auth.getUser();
      if (!data || !data.user) { me = null; return null; }
      const p = await sb.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
      me = p.data && p.data.active ? p.data : null;
      return me;
    }
    return {
      mode: "supabase",
      me: () => me,
      async restore() { return loadMe(); },
      async signIn(phone, password) {
        chk(await sb.auth.signInWithPassword({ email: toEmail(phone), password }));
        const p = await loadMe();
        if (!p) { await sb.auth.signOut(); throw new Error("This account has no access yet. Ask the admin to set it up."); }
        return p;
      },
      async signOut() { await sb.auth.signOut(); me = null; },
      async listProfiles(role) {
        let q = sb.from("profiles").select("*").order("full_name");
        if (role) q = q.eq("role", role);
        return chk(await q);
      },
      async createUser(u) {
        // A second client signs the new user up without logging the admin out.
        const tmp = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, storageKey: "mp-create-user" } });
        const r = await tmp.auth.signUp({ email: toEmail(u.phone), password: u.password });
        if (r.error) throw new Error(r.error.message);
        if (!r.data.user || (r.data.user.identities && r.data.user.identities.length === 0)) throw new Error("A login with this phone number already exists.");
        const row = { id: r.data.user.id, role: u.role, full_name: u.full_name, phone: u.phone, area: u.area || null, shop_name: u.shop_name || null, specialty: u.specialty || null, hospital: u.hospital || null, bmdc_no: u.bmdc_no || null };
        return chk(await sb.from("profiles").insert(row).select().single());
      },
      async updateProfile(id, patch) { const d = chk(await sb.from("profiles").update(patch).eq("id", id).select().single()); if (me && id === me.id) me = d; return d; },
      async listMothers() { return chk(await sb.from("mothers").select("*").order("created_at", { ascending: false })); },
      async addMother(m) { return chk(await sb.from("mothers").insert({ ...m, maa_bondhu_id: m.maa_bondhu_id || me.id }).select().single()); },
      async updateMother(id, patch) { return chk(await sb.from("mothers").update(patch).eq("id", id).select().single()); },
      async listAlerts() { return chk(await sb.from("alerts").select("*").order("created_at", { ascending: false })); },
      async addAlert(a) { return chk(await sb.from("alerts").insert(a).select().single()); },
      async resolveAlert(id) { return chk(await sb.from("alerts").update({ status: "visited", resolved_at: nowIso() }).eq("id", id).select().single()); },
      async listActivity() { return chk(await sb.from("activity").select("*").order("created_at", { ascending: false }).limit(500)); },
      async addActivity(a) { return chk(await sb.from("activity").insert({ ...a, user_id: me.id }).select().single()); },
      async listSales() { return chk(await sb.from("sales").select("*").order("created_at", { ascending: false })); },
      async addSale(s) { return chk(await sb.from("sales").insert({ ...s, shop_id: me.id }).select().single()); },
      async shopCustomers() { return chk(await sb.rpc("shop_customers")); },
      async listConsults() { return chk(await sb.from("consultations").select("*").order("created_at", { ascending: false })); },
      async addConsult(c) { return chk(await sb.from("consultations").insert({ ...c, maa_bondhu_id: me.id, room: room() }).select().single()); },
      async updateConsult(id, patch) { return chk(await sb.from("consultations").update({ ...patch, updated_at: nowIso() }).eq("id", id).select().single()); },
      subscribe(cb) {
        const ch = sb.channel("mp-live")
          .on("postgres_changes", { event: "*", schema: "public", table: "consultations" }, cb)
          .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, cb).subscribe();
        const t = setInterval(cb, 20000);
        return () => { clearInterval(t); sb.removeChannel(ch); };
      }
    };
  }

  // ---------------- Test mode ----------------
  function testApi() {
    const KEY = "maapushti-test-db-v1", SKEY = "maapushti-test-session";
    const uid = () => crypto.randomUUID();
    const daysFrom = d => { const x = new Date(); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
    const ago = m => new Date(Date.now() - m * 60000).toISOString();
    function seed() {
      const P = (role, full_name, phone, extra) => ({ id: uid(), role, full_name, phone, password: "demo1234", area: null, shop_name: null, specialty: null, hospital: null, bmdc_no: null, available: true, active: true, created_at: nowIso(), ...extra });
      const admin = P("admin", "Riyad Hossain", "01700000000");
      const mb1 = P("maa_bondhu", "Rahima Begum", "01711111111", { area: "Betka, Tongibari" });
      const mb2 = P("maa_bondhu", "Salma Akter", "01722222222", { area: "Sonarang, Tongibari" });
      const shop = P("shopkeeper", "Abdul Karim", "01733333333", { shop_name: "Karim Store, Betka bazar", area: "Betka" });
      const d1 = P("doctor", "Dr. Nasrin Sultana", "01744444444", { specialty: "Gynecologist and obstetrician", hospital: "Munshiganj General Hospital", bmdc_no: "A-45120" });
      const d2 = P("doctor", "Dr. Farhana Islam", "01755555555", { specialty: "Gynecologist", hospital: "Tongibari Upazila Health Complex", bmdc_no: "A-51877", available: false });
      const M = (full_name, phone, village, wk, mb, extra) => ({ id: uid(), full_name, phone, age: 24, village, union_name: village, edd: daysFrom((40 - wk) * 7), husband_name: null, husband_phone: null, mil_name: null, mil_phone: null, gravida: 1, risk_notes: "", next_checkup: daysFrom(3), maa_bondhu_id: mb.id, shop_id: shop.id, consent: true, created_at: ago(60 * 24 * 20), ...extra });
      const m = [
        M("Shirin Akter", "01811111111", "Betka", 24, mb1, { husband_name: "Jamal Hossain", husband_phone: "01811111112", mil_name: "Amena Begum", mil_phone: "01811111113", next_checkup: daysFrom(1) }),
        M("Rokeya Begum", "01822222222", "Betka", 31, mb1, { age: 29, gravida: 3, risk_notes: "Previous caesarean", next_checkup: daysFrom(-2) }),
        M("Nasima Khatun", "01833333333", "Betka", 12, mb1, { age: 19 }),
        M("Jesmin Akter", "01844444444", "Betka", 33, mb1, { next_checkup: daysFrom(5) }),
        M("Moriom Akter", "01855555555", "Sonarang", 36, mb2, { shop_id: null }),
        M("Taslima Begum", "01866666666", "Sonarang", 18, mb2, { shop_id: null })];
      return {
        profiles: [admin, mb1, mb2, shop, d1, d2], mothers: m,
        alerts: [{ id: uid(), mother_id: m[1].id, sign: "Swelling of hands, feet or face", note: "", source: "call", status: "open", created_at: ago(95), resolved_at: null },
                 { id: uid(), mother_id: m[3].id, sign: "Baby moving less", note: "", source: "call", status: "open", created_at: ago(60 * 20), resolved_at: null }],
        activity: [{ id: uid(), mother_id: m[0].id, user_id: mb1.id, kind: "visit", note: "Home visit. Eating eggs daily, taking iron tablets.", created_at: ago(60 * 24 * 3) }],
        sales: [{ id: uid(), mother_id: m[0].id, shop_id: shop.id, kind: "basket", amount: 0, method: null, created_at: ago(60 * 24 * 6) },
                { id: uid(), mother_id: m[0].id, shop_id: shop.id, kind: "payment", amount: 140, method: "bKash", created_at: ago(60 * 24 * 5) },
                { id: uid(), mother_id: m[1].id, shop_id: shop.id, kind: "basket", amount: 0, method: null, created_at: ago(60 * 24 * 2) }],
        consultations: [{ id: uid(), mother_id: m[1].id, maa_bondhu_id: mb1.id, doctor_id: d1.id, mode: "video", room: room(), reason: "Swelling and headache at 31 weeks", status: "done", doctor_notes: "Check blood pressure today. If above 140/90, refer to Upazila Health Complex.", created_at: ago(60 * 26), updated_at: ago(60 * 25) }]
      };
    }
    let db;
    const load = () => { try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { db = null; } if (!db || !db.profiles) { db = seed(); save(); } };
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} };
    load();
    let me = null;
    const pub = p => { const { password, ...rest } = p; return rest; };
    const role = () => me && me.role;
    const fresh = () => { load(); if (me) { const p = db.profiles.find(x => x.id === me.id); me = p && p.active ? pub(p) : null; } };
    const deny = () => { throw new Error("You don't have permission to do that."); };
    const motherVisible = m => role() === "admin" || (role() === "maa_bondhu" && m.maa_bondhu_id === me.id) || (role() === "doctor" && db.consultations.some(c => c.mother_id === m.id && c.doctor_id === me.id));
    const canSee = id => { const m = db.mothers.find(x => x.id === id); return !!m && motherVisible(m); };
    const sortNew = a => a.slice().sort((x, y) => y.created_at.localeCompare(x.created_at));
    return {
      mode: "test",
      me: () => me,
      reset() { db = seed(); save(); },
      async restore() { load(); let id = null; try { id = sessionStorage.getItem(SKEY); } catch (e) {} const p = id && db.profiles.find(x => x.id === id && x.active); me = p ? pub(p) : null; return me; },
      async signIn(phone, password) {
        load(); const p = db.profiles.find(x => x.phone === String(phone).replace(/\D/g, "") && x.password === password);
        if (!p) throw new Error("Wrong phone number or password.");
        if (!p.active) throw new Error("This account has been turned off by the admin.");
        me = pub(p); try { sessionStorage.setItem(SKEY, p.id); } catch (e) {} return me;
      },
      async signOut() { me = null; try { sessionStorage.removeItem(SKEY); } catch (e) {} },
      async listProfiles(r) {
        fresh(); let list = db.profiles.filter(p => p.id === me.id || role() === "admin" || (role() === "maa_bondhu" && ["doctor", "shopkeeper"].includes(p.role) && p.active)
          || (role() === "doctor" && db.consultations.some(c => c.doctor_id === me.id && c.maa_bondhu_id === p.id)));
        if (r) list = list.filter(p => p.role === r);
        return list.map(pub).sort((a, b) => a.full_name.localeCompare(b.full_name));
      },
      async createUser(u) {
        fresh(); if (role() !== "admin") deny();
        const phone = String(u.phone).replace(/\D/g, "");
        if (db.profiles.some(p => p.phone === phone)) throw new Error("A login with this phone number already exists.");
        if (!u.password || u.password.length < 6) throw new Error("Password must be at least 6 characters.");
        const p = { id: uid(), role: u.role, full_name: u.full_name, phone, password: u.password, area: u.area || null, shop_name: u.shop_name || null, specialty: u.specialty || null, hospital: u.hospital || null, bmdc_no: u.bmdc_no || null, available: true, active: true, created_at: nowIso() };
        db.profiles.push(p); save(); return pub(p);
      },
      async updateProfile(id, patch) {
        fresh(); if (role() !== "admin" && id !== me.id) deny();
        const p = db.profiles.find(x => x.id === id); if (role() !== "admin") { delete patch.role; delete patch.active; }
        Object.assign(p, patch); save(); if (id === me.id) me = pub(p); return pub(p);
      },
      async listMothers() { fresh(); return sortNew(db.mothers.filter(motherVisible)); },
      async addMother(m) {
        fresh(); const owner = m.maa_bondhu_id || me.id;
        if (!(role() === "admin" || (role() === "maa_bondhu" && owner === me.id))) deny();
        const row = { id: uid(), created_at: nowIso(), ...m, maa_bondhu_id: owner }; db.mothers.push(row); save(); return row;
      },
      async updateMother(id, patch) {
        fresh(); const m = db.mothers.find(x => x.id === id);
        if (!m || !(role() === "admin" || (role() === "maa_bondhu" && m.maa_bondhu_id === me.id))) deny();
        Object.assign(m, patch); save(); return m;
      },
      async listAlerts() { fresh(); return sortNew(db.alerts.filter(a => canSee(a.mother_id))); },
      async addAlert(a) { fresh(); if (!canSee(a.mother_id)) deny(); const row = { id: uid(), status: "open", source: "call", note: "", created_at: nowIso(), resolved_at: null, ...a }; db.alerts.push(row); save(); return row; },
      async resolveAlert(id) { fresh(); const a = db.alerts.find(x => x.id === id); if (!a || !canSee(a.mother_id)) deny(); a.status = "visited"; a.resolved_at = nowIso(); save(); return a; },
      async listActivity() { fresh(); return sortNew(db.activity.filter(a => canSee(a.mother_id))); },
      async addActivity(a) { fresh(); if (!canSee(a.mother_id)) deny(); const row = { id: uid(), user_id: me.id, created_at: nowIso(), ...a }; db.activity.push(row); save(); return row; },
      async listSales() {
        fresh(); return sortNew(db.sales.filter(s => role() === "admin" || s.shop_id === me.id || (role() === "maa_bondhu" && db.mothers.some(m => m.id === s.mother_id && m.maa_bondhu_id === me.id))));
      },
      async addSale(s) {
        fresh(); const m = db.mothers.find(x => x.id === s.mother_id);
        if (role() !== "shopkeeper" || !m || m.shop_id !== me.id) deny();
        const row = { id: uid(), shop_id: me.id, created_at: nowIso(), amount: 0, method: null, ...s }; db.sales.push(row); save(); return row;
      },
      async shopCustomers() { fresh(); if (role() !== "shopkeeper") return []; return db.mothers.filter(m => m.shop_id === me.id).map(m => ({ id: m.id, full_name: m.full_name, village: m.village })).sort((a, b) => a.full_name.localeCompare(b.full_name)); },
      async listConsults() { fresh(); return sortNew(db.consultations.filter(c => role() === "admin" || c.maa_bondhu_id === me.id || c.doctor_id === me.id)); },
      async addConsult(c) {
        fresh(); const m = db.mothers.find(x => x.id === c.mother_id); const d = db.profiles.find(x => x.id === c.doctor_id && x.role === "doctor");
        if (role() !== "maa_bondhu" || !m || m.maa_bondhu_id !== me.id || !d) deny();
        const row = { id: uid(), maa_bondhu_id: me.id, room: room(), status: "requested", doctor_notes: null, created_at: nowIso(), updated_at: nowIso(), mode: "video", ...c };
        db.consultations.push(row); save(); return row;
      },
      async updateConsult(id, patch) {
        fresh(); const c = db.consultations.find(x => x.id === id);
        if (!c || !(role() === "admin" || c.maa_bondhu_id === me.id || c.doctor_id === me.id)) deny();
        Object.assign(c, patch, { updated_at: nowIso() }); save(); return c;
      },
      subscribe(cb) {
        const on = e => { if (e.key === KEY) cb(); };
        window.addEventListener("storage", on); const t = setInterval(cb, 8000);
        return () => { window.removeEventListener("storage", on); clearInterval(t); };
      }
    };
  }

  window.MP_API = (CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase) ? supabaseApi() : testApi();
})();
