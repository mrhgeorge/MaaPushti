// MaaPushti web app: one page, five roles (admin, Maa Bondhu, shopkeeper, gynecologist, family).
(function () {
  const api = window.MP_API, CFG = window.MAAPUSHTI_CONFIG || {};
  const $ = s => document.querySelector(s);
  const app = $("#app");
  const BASKET = 280;
  const SIGNS = ["Bleeding", "Swelling of hands, feet or face", "Severe headache or fits", "Fever", "Baby moving less"];
  const ROLE = { admin: "Admin", maa_bondhu: "Maa Bondhu", shopkeeper: "Shopkeeper", doctor: "Gynecologist", family: "Family" };
  const CORE = [["Eggs", "7 (one a day)", 105, "Protein, choline for the baby's brain"], ["Red lentils", "500 g", 65, "Protein, iron, folate"], ["Leafy greens", "2 bunches", 40, "Iron, folate, vitamin A"], ["Small fish (eaten whole)", "250 g", 70, "Calcium, iron, vitamin A"]];
  const OST = { awaiting_deposit: ["Waiting for deposit", "t-co"], confirmed: ["Confirmed", "t-ok"], picked_up: ["Picked up", "t-ok"], missed: ["Missed", "t-red"], cancelled: ["Cancelled", "t-mut"] };
  const RELS = ["Husband", "Mother-in-law", "Son", "Daughter", "Sister", "Brother", "Other relative"];
  const TABS = {
    admin: [["overview", "Overview"], ["users", "Users"], ["mothers", "Mothers"], ["consults", "Consultations"], ["ivr", "Phone demo"], ["me", "My profile"]],
    maa_bondhu: [["home", "My mothers"], ["register", "Register mother"], ["doctors", "Doctors"], ["consults", "Consultations"], ["ivr", "Phone demo"], ["me", "My profile"]],
    shopkeeper: [["orders", "Pre-orders"], ["record", "Record sale"], ["ledger", "Khata"], ["me", "My profile"]],
    family: [["family", "Our mother"], ["basket", "Basket order"], ["me", "My profile"]],
    doctor: [["requests", "Requests"], ["history", "History"], ["me", "My profile"]]
  };
  let D = { profiles: [], mothers: [], alerts: [], activity: [], sales: [], consults: [], customers: [], orders: [], choices: [] };
  let filt = "all", q = "", unsub = null, openMother = null, seenReq = new Set();

  // ---------- helpers ----------
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const dayDiff = s => s ? Math.round((new Date(s + "T00:00:00") - today()) / 864e5) : null;
  const fmtD = s => s ? new Date(s.length <= 10 ? s + "T00:00:00" : s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "-";
  const ago = s => { const m = Math.round((Date.now() - new Date(s)) / 6e4); return m < 1 ? "just now" : m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " days ago"; };
  const week = edd => { const d = dayDiff(edd); return d == null ? null : Math.max(1, Math.min(42, 40 - Math.ceil(d / 7))); };
  const tri = w => w <= 13 ? "1st" : w <= 27 ? "2nd" : "3rd";
  const telHref = p => { const d = String(p || "").replace(/\D/g, ""); return "tel:" + (d.startsWith("0") ? (CFG.COUNTRY_CODE || "+88") + d : "+" + d); };
  const meetUrl = (c, name) => (CFG.MEET_BASE || "https://meet.jit.si/") + c.room + "#userInfo.displayName=%22" + encodeURIComponent(name) + "%22" + (c.mode === "audio" ? "&config.startAudioOnly=true&config.startWithVideoMuted=true" : "");
  const byId = (list, id) => list.find(x => x.id === id);
  const pName = id => (byId(D.profiles, id) || {}).full_name || "-";
  const mName = id => (byId(D.mothers, id) || byId(D.customers, id) || {}).full_name || "Mother";
  const isDanger = a => a.source !== "shop";
  const openAlerts = id => D.alerts.filter(a => a.mother_id === id && a.status === "open" && isDanger(a));
  const basketPrice = s => s.amount || BASKET;
  const ymd = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  // Pickup is on Friday; orders for a Friday close on Wednesday night.
  const nextPickup = () => { const d = new Date(), w = d.getDay(); d.setDate(d.getDate() + (5 - w + 7) % 7 + (w === 4 || w === 5 ? 7 : 0)); return ymd(d); };
  const cutoffOf = pd => { const d = new Date(pd + "T00:00:00"); d.setDate(d.getDate() - 2); return d; };
  const fmtDay = s => new Date(s + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
  const ordersOf = id => D.orders.filter(o => o.mother_id === id);
  const currentOrder = id => D.orders.find(o => o.mother_id === id && o.pickup_date >= nextPickup() && o.status !== "cancelled");
  const pickups = id => D.orders.filter(o => o.mother_id === id && o.status === "picked_up").length;
  const ostTag = o => tag(OST[o.status][0], OST[o.status][1]);
  const itemsText = o => (o.items || []).length ? o.items.map(i => i.name.split(":")[0]).join(", ") : "Core only";
  const toast = t => { const e = $("#toast"); e.textContent = t; e.classList.add("on"); clearTimeout(toast.h); toast.h = setTimeout(() => e.classList.remove("on"), 3200); };
  const me = () => api.me();
  const guard = async (fn, msg) => { try { const r = await fn(); if (msg) toast(msg); return r; } catch (e) { toast(e.message || "Something went wrong"); console.error(e); } };
  const form = f => Object.fromEntries(new FormData(f).entries());
  const tag = (t, c) => `<span class="pill ${c}">${esc(t)}</span>`;
  const callNo = p => (p && (p.contact_phone || p.phone)) || "";
  const loc = p => [p.union_name, p.upazila, p.district].filter(Boolean).join(", ") || p.area || "";
  const av = (p, n = 40) => p && p.photo ? `<img class="av" src="${esc(p.photo)}" alt="" width="${n}" height="${n}" style="width:${n}px;height:${n}px">`
    : `<span class="av" style="width:${n}px;height:${n}px;font-size:${Math.round(n * .4)}px">${esc(((p && p.full_name) || "?").replace(/^Dr\.?\s*/, "").split(" ").map(w => w[0]).slice(0, 2).join(""))}</span>`;

  // ---------- Division > District > Upazila > Union ----------
  let GEO = null;
  const geo = async () => { if (!GEO) GEO = await fetch("geo.json").then(r => r.json()); return GEO; };
  const geoBlock = () => `<div class="f"><label>Division</label><select name="division" aria-label="Division"></select></div>
    <div class="f"><label>District</label><select name="district" aria-label="District"></select></div>
    <div class="f"><label>Upazila</label><select name="upazila" aria-label="Upazila"></select></div>
    <div class="f"><label>Union</label><select name="union_name" aria-label="Union"></select></div>`;
  function bindGeo(root, v = {}) {
    const G = GEO; if (!G) return;
    const el = n => root.querySelector(`[name=${n}]`), dv = el("division"), ds = el("district"), uz = el("upazila"), un = el("union_name");
    const fill = (e, items, cur, ph) => { e.innerHTML = `<option value="">${ph}</option>` + items.map(n => `<option ${n === cur ? "selected" : ""}>${esc(n)}</option>`).join(""); e.disabled = !items.length; };
    const divId = () => (G.divisions.find(d => d[1] === dv.value) || [])[0];
    const disId = () => (G.districts.find(d => d[2] === ds.value && d[1] === divId()) || [])[0];
    const upzId = () => (G.upazilas.find(u => u[2] === uz.value && u[1] === disId()) || [])[0];
    const fDis = c => fill(ds, G.districts.filter(d => d[1] === divId()).map(d => d[2]).sort(), c, "Select district");
    const fUpz = c => fill(uz, G.upazilas.filter(u => u[1] === disId()).map(u => u[2]).sort(), c, "Select upazila");
    const fUni = c => fill(un, G.unions.filter(u => u[0] === upzId()).map(u => u[1]).sort(), c, un.options && upzId() ? "Select union" : "Select union");
    fill(dv, G.divisions.map(d => d[1]).sort(), v.division, "Select division"); fDis(v.district); fUpz(v.upazila); fUni(v.union_name);
    dv.onchange = () => { fDis(); fUpz(); fUni(); }; ds.onchange = () => { fUpz(); fUni(); }; uz.onchange = () => fUni();
  }
  function geoCheck(root, needUnion) {
    const el = n => root.querySelector(`[name=${n}]`);
    for (const [n, l] of [["division", "division"], ["district", "district"], ["upazila", "upazila"]]) if (!el(n).value) return "Please select the " + l + ".";
    if (needUnion && !el("union_name").disabled && !el("union_name").value) return "Please select the union.";
    return "";
  }
  const areaOf = v => v.union_name ? v.union_name + ", " + v.upazila : [v.upazila, v.district].filter(Boolean).join(", ");
  const toPhoto = file => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => { const S = 320, c = document.createElement("canvas"); c.width = c.height = S; const k = Math.min(img.width, img.height);
      c.getContext("2d").drawImage(img, (img.width - k) / 2, (img.height - k) / 2, k, k, 0, 0, S, S); URL.revokeObjectURL(img.src); res(c.toDataURL("image/jpeg", 0.82)); };
    img.onerror = () => rej(new Error("Could not read that picture. Try a JPG or PNG."));
    img.src = URL.createObjectURL(file);
  });

  function status(m) {
    if (openAlerts(m.id).length) return tag("Danger sign", "t-red");
    const d = dayDiff(m.next_checkup);
    if (d != null && d < 0) return tag("Checkup overdue " + -d + "d", "t-co");
    return tag("On track", "t-ok");
  }

  // ---------- data ----------
  async function load() {
    const r = me().role, P = [];
    const set = (k, p) => P.push(p.then(v => { D[k] = v; }));
    set("profiles", api.listProfiles());
    if (r !== "shopkeeper") { set("mothers", api.listMothers()); set("alerts", api.listAlerts()); set("activity", api.listActivity()); set("consults", api.listConsults()); }
    if (r !== "doctor") set("sales", api.listSales());
    if (r === "shopkeeper") set("customers", api.shopCustomers());
    if (r !== "doctor") { set("orders", api.listOrders()); set("choices", api.listChoices()); }
    await Promise.all(P);
  }

  // ---------- login ----------
  function loginView(err) {
    app.innerHTML = `<div class="login"><form class="box" id="lf">
      <h1>MaaPushti</h1><p class="sub">Maternal nutrition and care. Sign in with your phone number.</p>
      <div class="f"><label for="lp">Phone number</label><input id="lp" name="phone" inputmode="tel" autocomplete="username" required placeholder="01XXXXXXXXX"></div>
      <div class="f" style="margin-top:12px"><label for="lw">Password</label><input id="lw" name="password" type="password" autocomplete="current-password" required></div>
      <p class="err" id="le">${esc(err || "")}</p>
      <button class="btn pri" style="width:100%">Sign in</button>
      ${api.mode === "test" ? `<div class="note" style="margin-top:16px"><b>Test mode logins</b> (password <b>demo1234</b>):<br>
        Admin 01700000000 · Maa Bondhu 01711111111 or 01722222222<br>Shopkeeper 01733333333 · Gynecologist 01744444444<br>Family (Shirin's husband) 01766666666</div>` : ""}
    </form></div>`;
    $("#lf").onsubmit = async e => {
      e.preventDefault(); const v = form(e.target); $("#le").textContent = "Signing in...";
      try { await api.signIn(v.phone, v.password); start(); } catch (x) { $("#le").textContent = x.message; }
    };
  }

  // ---------- shell ----------
  function tab() { const t = location.hash.slice(1), list = TABS[me().role]; return list.some(x => x[0] === t) ? t : list[0][0]; }
  function shell(body) {
    const u = me(), t = tab();
    const badge = k => { const n = k === "home" || k === "overview" ? D.alerts.filter(a => a.status === "open").length : k === "requests" ? D.consults.filter(c => c.status === "requested" && c.doctor_id === u.id).length
      : k === "orders" ? D.orders.filter(o => o.status === "awaiting_deposit" && o.pickup_date >= nextPickup()).length : k === "basket" ? D.orders.filter(o => o.status === "awaiting_deposit" && o.pickup_date >= nextPickup()).length : 0; return n ? ` <span class="badge">${n}</span>` : ""; };
    app.innerHTML = `${api.mode === "test" ? `<div class="testbar">Test mode: sample data stored only in this browser. <a href="#" id="rst">Reset sample data</a></div>` : ""}
      <header class="top"><div class="row"><div class="brand">MaaPushti</div>
      <div class="who"><a href="#me" style="display:flex;align-items:center;gap:8px;color:inherit;text-decoration:none">${av(u, 32)}<b>${esc(u.full_name)}</b></a><span class="pill">${ROLE[u.role]}</span><button class="btn sm" id="lo" style="background:transparent;color:#fff;border-color:rgba(255,255,255,.4)">Sign out</button></div></div>
      <nav>${TABS[u.role].map(([k, l]) => `<a href="#${k}" class="${k === t ? "on" : ""}">${l}${badge(k)}</a>`).join("")}</nav></header>
      <main id="main">${body}</main>`;
    $("#lo").onclick = async () => { if (unsub) unsub(); await api.signOut(); loginView(); };
    const r = $("#rst"); if (r) r.onclick = async e => { e.preventDefault(); api.reset(); await api.signOut(); loginView("Sample data reset. Sign in again."); };
  }

  async function render() {
    if (!me()) return loginView();
    const t = tab(), r = me().role;
    const V = {
      admin: { overview: adminOverview, users: adminUsers, mothers: adminMothers, consults: consultsView, ivr: ivrView, me: profileView },
      maa_bondhu: { home: mbHome, register: registerView, doctors: doctorsView, consults: consultsView, ivr: ivrView, me: profileView },
      shopkeeper: { orders: shopOrders, record: shopRecord, ledger: shopLedger, me: profileView },
      family: { family: familyHome, basket: familyBasket, me: profileView },
      doctor: { requests: docRequests, history: docHistory, me: profileView }
    };
    shell(V[r][t]());
    bind[t] && bind[t]();
    bindCommon();
  }
  const bind = {};

  // ---------- shared pieces ----------
  function motherTable(list, opts = {}) {
    if (!list.length) return `<p class="empty">No mothers here yet.</p>`;
    return `<div class="scroll"><table class="stack"><thead><tr><th>Mother</th><th>Village</th><th class="num">Week</th><th>Status</th><th>Next checkup</th>${opts.mb ? "<th>Maa Bondhu</th>" : ""}<th>Actions</th></tr></thead><tbody>
      ${list.map(m => { const w = week(m.edd), d = dayDiff(m.next_checkup); return `<tr>
        <td data-l="Mother"><a href="#" data-open="${m.id}"><b>${esc(m.full_name)}</b></a></td>
        <td data-l="Village">${esc(m.village)}</td>
        <td class="num" data-l="Week">${w} <span class="note">(${tri(w)})</span></td>
        <td data-l="Status">${status(m)}</td>
        <td data-l="Next checkup" style="white-space:nowrap">${m.next_checkup ? fmtD(m.next_checkup) + (d < 0 ? ` <span style="color:var(--red)">overdue</span>` : "") : "-"}</td>
        ${opts.mb ? `<td data-l="Maa Bondhu">${esc(pName(m.maa_bondhu_id))}</td>` : ""}
        <td data-l="Actions"><div class="acts">${opts.call !== false ? `<a class="btn call sm" href="${telHref(m.phone)}" data-call="${m.id}">Call</a>` : ""}<button class="btn sm" data-open="${m.id}">Open</button></div></td></tr>`; }).join("")}
    </tbody></table></div>`;
  }
  function alertList(list) {
    if (!list.length) return `<p class="empty">No open danger-sign alerts.</p>`;
    return list.map(a => { const m = byId(D.mothers, a.mother_id) || {}; return `<div class="alert${isDanger(a) ? "" : " chk"}"><div><b>${isDanger(a) ? "" : "Check in: "}${esc(a.sign)}</b> · ${esc(m.full_name)}, ${esc(m.village)}${m.edd ? ", week " + week(m.edd) : ""}
      <div class="note">${ago(a.created_at)} · reported by ${esc({ call: "her weekly call", visit: "home visit", family: "her family", shop: "the shop" }[a.source] || a.source)}${a.note ? " · " + esc(a.note) : ""}</div></div>
      <div class="acts">${m.phone ? `<a class="btn call sm" href="${telHref(m.phone)}" data-call="${m.id}">Call mother</a>` : ""}<button class="btn sm" data-open="${m.id}">Open</button><button class="btn co sm" data-resolve="${a.id}">Mark visited</button></div></div>`; }).join("");
  }
  function bindCommon() {
    const root = $("#main"); if (!root) return;
    root.querySelectorAll("[data-open]").forEach(b => b.onclick = e => { e.preventDefault(); motherModal(b.dataset.open); });
    root.querySelectorAll("[data-call]").forEach(b => b.addEventListener("click", () => logCall(b.dataset.call, b.dataset.who || "mother")));
    root.querySelectorAll("[data-resolve]").forEach(b => b.onclick = async () => { await guard(() => api.resolveAlert(b.dataset.resolve), "Marked as visited"); await refresh(); });
    root.querySelectorAll("[data-consult]").forEach(b => b.onclick = () => consultModal(b.dataset.consult || null, b.dataset.doc || null));
  }
  async function logCall(motherId, who) {
    if (me().role === "doctor" || me().role === "admin") return;
    toast("Calling " + mName(motherId) + (who !== "mother" ? "'s " + who : "") + " from your phone. Call logged.");
    await guard(() => api.addActivity({ mother_id: motherId, kind: "call", note: "Phone call to " + who }));
    D.activity = await api.listActivity();
    if (openMother && $(".modal")) motherModal(openMother);
  }
  async function refresh() { await guard(load); if (openMother) { motherModal(openMother); } else render(); }

  // ---------- mother detail ----------
  function closeModal() { const m = $(".modal"); if (m) m.remove(); openMother = null; render(); }
  function modal(html) {
    const old = $(".modal"); if (old) old.remove();
    const el = document.createElement("div"); el.className = "modal"; el.innerHTML = `<div class="box" role="dialog" aria-modal="true"><button class="x" aria-label="Close">×</button>${html}</div>`;
    document.body.appendChild(el); el.querySelector(".x").onclick = closeModal; el.onclick = e => { if (e.target === el) closeModal(); };
    return el;
  }
  function motherModal(id) {
    const m = byId(D.mothers, id); if (!m) return; openMother = id;
    const r = me().role, canEdit = r === "maa_bondhu" || r === "admin", w = week(m.edd);
    const events = [
      ...D.alerts.filter(a => a.mother_id === id).map(a => ({ t: a.created_at, c: a.status === "open" ? "red" : "", h: `<b>Danger sign: ${esc(a.sign)}</b> ${a.status === "open" ? tag("Open", "t-red") : tag("Visited", "t-ok")}${a.note ? "<br>" + esc(a.note) : ""}` })),
      ...D.activity.filter(a => a.mother_id === id).map(a => ({ t: a.created_at, c: "", h: `<b>${{ call: "Phone call", visit: "Home visit", note: "Note", checkup: "Checkup" }[a.kind]}</b> by ${esc(pName(a.user_id))}${a.note ? "<br>" + esc(a.note) : ""}` })),
      ...D.sales.filter(s => s.mother_id === id).map(s => ({ t: s.created_at, c: "co", h: s.kind === "basket" ? `<b>Pushti Basket bought</b> (BDT ${basketPrice(s)})` : `<b>Paid BDT ${s.amount}</b> by ${esc(s.method || "")}` })),
      ...ordersOf(id).map(o => ({ t: o.created_at, c: "co", h: `<b>Basket ordered for ${fmtD(o.pickup_date)}</b> ${ostTag(o)}<br>${esc(itemsText(o))} · BDT ${o.total} · by ${esc({ family: "family", call: "phone call", maa_bondhu: "Maa Bondhu" }[o.source])}` })),
      ...D.consults.filter(c => c.mother_id === id).map(c => ({ t: c.created_at, c: "co", h: `<b>${c.mode === "video" ? "Video" : "Audio"} consultation</b> with ${esc(pName(c.doctor_id))} ${tag(c.status, c.status === "done" ? "t-ok" : "t-co")}${c.reason ? "<br>Reason: " + esc(c.reason) : ""}${c.doctor_notes ? "<br><b>Doctor's advice:</b> " + esc(c.doctor_notes) : ""}` }))
    ].sort((a, b) => b.t.localeCompare(a.t));
    const fam = [["husband", m.husband_name, m.husband_phone], ["mother-in-law", m.mil_name, m.mil_phone]].filter(f => f[2]);
    const el = modal(`<h1>${esc(m.full_name)}</h1><p class="sub">Week ${w} (${tri(w)} trimester) · ${esc(m.village)} · Due ${fmtD(m.edd)}</p>
      <div class="acts">${r === "maa_bondhu" ? `<a class="btn call" href="${telHref(m.phone)}" data-call="${m.id}">Call mother</a>
        ${fam.map(f => `<a class="btn" href="${telHref(f[2])}" data-call="${m.id}" data-who="${f[0]}">Call ${f[0]}</a>`).join("")}
        <button class="btn co" data-consult="${m.id}">Consult a doctor</button>` : ""}
        ${canEdit ? `<button class="btn" data-order="${m.id}">Basket order${currentOrder(m.id) ? ": " + OST[currentOrder(m.id).status][0].toLowerCase() : ""}</button>` : ""}
        ${r === "doctor" ? `<a class="btn call" href="${telHref(m.phone)}">Call mother</a>` : ""}</div>
      <div class="kv">
        <div><span>Phone</span>${esc(m.phone)}</div><div><span>Age</span>${esc(m.age || "-")}</div><div><span>Pregnancy number</span>${esc(m.gravida || "-")}</div>
        <div><span>Next checkup</span>${fmtD(m.next_checkup)}</div><div><span>Husband</span>${esc(m.husband_name || "-")} ${esc(m.husband_phone || "")}</div>
        <div><span>Mother-in-law</span>${esc(m.mil_name || "-")} ${esc(m.mil_phone || "")}</div><div><span>Maa Bondhu</span>${esc(pName(m.maa_bondhu_id))}</div>
        <div><span>Shop</span>${esc((byId(D.profiles, m.shop_id) || {}).shop_name || "-")}</div><div><span>Registered</span>${fmtD(m.created_at)}</div>
      </div>${m.risk_notes ? `<p><b>Risk notes:</b> ${esc(m.risk_notes)}</p>` : ""}
      ${canEdit ? `<h2>Record</h2><form class="grid" id="mrec">
        <div class="f"><label for="rk">What happened</label><select id="rk" name="kind"><option value="visit">Home visit</option><option value="call">Phone call</option><option value="checkup">Checkup done</option><option value="note">Note</option><option value="alert">Danger sign found</option></select></div>
        <div class="f" id="sgw" hidden><label for="sg">Danger sign</label><select id="sg" name="sign">${SIGNS.map(s => `<option>${s}</option>`).join("")}</select></div>
        <div class="f"><label for="nc">Next checkup</label><input id="nc" name="next_checkup" type="date" value="${esc(m.next_checkup || "")}"></div>
        <div class="f full"><label for="rn">Notes</label><textarea id="rn" name="note" placeholder="What did you see or advise?"></textarea></div>
        <div><button class="btn pri">Save</button></div></form>` : ""}
      ${canEdit ? familySection(m) : ""}
      <h2>History</h2>${events.length ? `<ul class="tl">${events.map(e => `<li class="${e.c}">${e.h}<br><small>${fmtD(e.t)} · ${ago(e.t)}</small></li>`).join("")}</ul>` : `<p class="empty">Nothing recorded yet.</p>`}`);
    el.querySelectorAll("[data-call]").forEach(b => b.addEventListener("click", () => logCall(b.dataset.call, b.dataset.who || "mother")));
    el.querySelectorAll("[data-consult]").forEach(b => b.onclick = () => consultModal(b.dataset.consult));
    el.querySelectorAll("[data-order]").forEach(b => b.onclick = () => orderModal(b.dataset.order));
    if (canEdit) bindFamilySection(el, m);
    const f = el.querySelector("#mrec");
    if (f) {
      f.kind.onchange = () => { el.querySelector("#sgw").hidden = f.kind.value !== "alert"; };
      f.onsubmit = async e => {
        e.preventDefault(); const v = form(f);
        await guard(async () => {
          if (v.kind === "alert") await api.addAlert({ mother_id: id, sign: v.sign, note: v.note, source: "visit" });
          else await api.addActivity({ mother_id: id, kind: v.kind, note: v.note });
          if (v.next_checkup !== (m.next_checkup || "")) await api.updateMother(id, { next_checkup: v.next_checkup || null });
        }, "Saved");
        await refresh();
      };
    }
  }

  // ---------- consultation ----------
  function consultModal(motherId, doctorId) {
    const mine = D.mothers.filter(m => m.maa_bondhu_id === me().id);
    const docs = D.profiles.filter(p => p.role === "doctor" && p.active).sort((a, b) => b.available - a.available);
    if (!docs.length) return toast("No gynecologists have been added yet. Ask the admin.");
    const el = modal(`<h1>Consult a gynecologist</h1><p class="sub">The doctor sees the request on her dashboard and joins the same call. The mother doesn't need to travel.</p>
      <form class="grid" id="cf">
        <div class="f"><label for="cm">Mother</label><select id="cm" name="mother_id" required>${mine.map(m => `<option value="${m.id}" ${m.id === motherId ? "selected" : ""}>${esc(m.full_name)}, week ${week(m.edd)}</option>`).join("")}</select></div>
        <div class="f"><label for="cd">Doctor</label><select id="cd" name="doctor_id" required>${docs.map(d => `<option value="${d.id}" ${d.id === doctorId ? "selected" : ""}>${esc(d.full_name)}${d.available ? "" : " (busy)"}</option>`).join("")}</select></div>
        <div class="f"><label for="cmo">Call type</label><select id="cmo" name="mode"><option value="video">Video call</option><option value="audio">Audio call</option></select></div>
        <div class="f full"><label for="cr">Reason</label><textarea id="cr" name="reason" required placeholder="e.g. Swelling of feet and headache since yesterday"></textarea></div>
        <div class="acts"><button class="btn co">Start call now</button></div></form>
      <p class="note">The call opens in a new tab with Jitsi Meet. Allow camera and microphone when asked.</p>`);
    el.querySelector("#cf").onsubmit = async e => {
      e.preventDefault(); const v = form(e.target);
      const w = window.open("about:blank", "_blank");
      const c = await guard(() => api.addConsult({ mother_id: v.mother_id, doctor_id: v.doctor_id, mode: v.mode, reason: v.reason }));
      if (!c) { if (w) w.close(); return; }
      const url = meetUrl(c, me().full_name);
      if (w) w.location = url;
      await guard(() => api.addActivity({ mother_id: v.mother_id, kind: "note", note: "Started " + v.mode + " consultation with " + pName(v.doctor_id) }));
      await guard(load);
      modal(`<h1>Call started</h1><p>${esc(pName(c.doctor_id))} has been notified. If the call didn't open, use the button below.</p>
        <div class="acts"><a class="btn co" href="${url}" target="_blank" rel="noopener">Open ${c.mode} call</a><a class="btn" href="${telHref(callNo(byId(D.profiles, c.doctor_id)))}">Phone the doctor</a></div>`);
    };
  }

  function consultsView() {
    const r = me().role, list = D.consults;
    return `<h1>Consultations</h1><p class="sub">${r === "admin" ? "All doctor consultations." : "Your requests to gynecologists."}</p>
      ${r === "maa_bondhu" ? `<button class="btn co" data-consult="">New consultation</button>` : ""}
      ${list.length ? `<div class="scroll" style="margin-top:12px"><table class="stack"><thead><tr><th>When</th><th>Mother</th><th>Doctor</th>${r === "admin" ? "<th>Maa Bondhu</th>" : ""}<th>Type</th><th>Status</th><th>Advice</th><th></th></tr></thead><tbody>
      ${list.map(c => `<tr><td data-l="When" style="white-space:nowrap">${ago(c.created_at)}</td><td data-l="Mother"><a href="#" data-open="${c.mother_id}">${esc(mName(c.mother_id))}</a></td><td data-l="Doctor">${esc(pName(c.doctor_id))}</td>
        ${r === "admin" ? `<td data-l="Maa Bondhu">${esc(pName(c.maa_bondhu_id))}</td>` : ""}<td data-l="Type">${c.mode}</td><td data-l="Status">${tag(c.status, c.status === "done" ? "t-ok" : c.status === "declined" ? "t-mut" : "t-co")}</td>
        <td data-l="Advice">${esc(c.doctor_notes || "-")}</td><td data-l="">${["requested", "active"].includes(c.status) && r === "maa_bondhu" ? `<a class="btn sm co" href="${meetUrl(c, me().full_name)}" target="_blank" rel="noopener">Rejoin</a>` : ""}</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="empty">No consultations yet.</p>`}`;
  }

  // ---------- Maa Bondhu ----------
  function mbHome() {
    const mine = D.mothers.filter(m => m.maa_bondhu_id === me().id);
    const oa = D.alerts.filter(a => a.status === "open"), od = oa.filter(isDanger), over = mine.filter(m => dayDiff(m.next_checkup) < 0).length;
    const ords = D.orders.filter(o => o.pickup_date === nextPickup() && o.status !== "cancelled" && mine.some(m => m.id === o.mother_id));
    let list = mine.filter(m => filt === "all" || (filt === "alert" && openAlerts(m.id).length) || (filt === "over" && dayDiff(m.next_checkup) < 0) || (filt === "t3" && week(m.edd) > 27));
    if (q) list = list.filter(m => (m.full_name + " " + m.village + " " + m.phone).toLowerCase().includes(q));
    list.sort((a, b) => openAlerts(b.id).length - openAlerts(a.id).length || (dayDiff(a.next_checkup) ?? 99) - (dayDiff(b.next_checkup) ?? 99));
    return `<h1>Good day, ${esc(me().full_name.split(" ")[0])}</h1><p class="sub">${esc(me().area || "")} · You can only see the mothers you look after.</p>
      <div class="kpis"><div class="kpi"><b>${mine.length}</b><span>My mothers</span></div><div class="kpi ${od.length ? "hot" : ""}"><b>${od.length}</b><span>Open danger signs</span></div>
      <div class="kpi"><b>${over}</b><span>Overdue checkups</span></div><div class="kpi"><b>${D.consults.filter(c => c.status !== "done" && c.status !== "declined").length}</b><span>Open consultations</span></div>
      <div class="kpi"><b>${ords.length}</b><span>Baskets ordered for ${esc(fmtDay(nextPickup()).split(",")[0])}</span></div></div>
      <h2>Alerts</h2>${alertList(oa)}
      <h2>My mothers</h2><div class="tools">${[["all", "All"], ["alert", "Danger sign"], ["over", "Checkup overdue"], ["t3", "3rd trimester"]].map(([k, l]) => `<button class="chip ${filt === k ? "on" : ""}" data-f="${k}">${l}</button>`).join("")}
      <input id="q" type="search" placeholder="Search name, village or phone" value="${esc(q)}" aria-label="Search"><a class="btn pri" href="#register">+ Register mother</a></div>
      ${motherTable(list)}`;
  }
  bind.home = () => {
    document.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { filt = b.dataset.f; render(); });
    const s = $("#q"); s.oninput = () => { q = s.value.trim().toLowerCase(); const p = s.selectionStart; render(); const n = $("#q"); n.focus(); n.setSelectionRange(p, p); };
  };

  function registerView() {
    const shops = D.profiles.filter(p => p.role === "shopkeeper" && p.active), mbs = D.profiles.filter(p => p.role === "maa_bondhu" && p.active);
    const isAdmin = me().role === "admin";
    return `<h1>Register a pregnant mother</h1><p class="sub">Fill this in at her home. Fields marked * are needed. If she knows only her last period date, enter it and the due date fills in.</p>
      <form class="grid card" id="rf">
        <div class="f"><label for="r1">Full name *</label><input id="r1" name="full_name" required></div>
        <div class="f"><label for="r2">Mobile number *</label><input id="r2" name="phone" inputmode="tel" required placeholder="01XXXXXXXXX" pattern="0?1[0-9]{9}"></div>
        <div class="f"><label for="r3">Age</label><input id="r3" name="age" type="number" min="12" max="55"></div>
        <div class="f"><label for="r4">Village *</label><input id="r4" name="village" required></div>
        <div class="f"><label for="r5">Union</label><input id="r5" name="union_name"></div>
        <div class="f"><label for="r6">Last period date</label><input id="r6" name="lmp" type="date"></div>
        <div class="f"><label for="r7">Expected delivery date *</label><input id="r7" name="edd" type="date" required></div>
        <div class="f"><label for="r8">Pregnancy number</label><input id="r8" name="gravida" type="number" min="1" max="15" value="1"></div>
        <div class="f"><label for="r9">Husband's name</label><input id="r9" name="husband_name"></div>
        <div class="f"><label for="r10">Husband's mobile</label><input id="r10" name="husband_phone" inputmode="tel"></div>
        <div class="f"><label for="r11">Mother-in-law's name</label><input id="r11" name="mil_name"></div>
        <div class="f"><label for="r12">Mother-in-law's mobile</label><input id="r12" name="mil_phone" inputmode="tel"></div>
        <div class="f"><label for="r13">Pushti Basket shop</label><select id="r13" name="shop_id"><option value="">No shop yet</option>${shops.map(s => `<option value="${s.id}">${esc(s.shop_name || s.full_name)}</option>`).join("")}</select></div>
        <div class="f"><label for="r14">First checkup date</label><input id="r14" name="next_checkup" type="date"></div>
        ${isAdmin ? `<div class="f"><label for="r16">Maa Bondhu *</label><select id="r16" name="maa_bondhu_id" required>${mbs.map(p => `<option value="${p.id}">${esc(p.full_name)}</option>`).join("")}</select></div>` : ""}
        <div class="f full"><label for="r15">Health notes (previous complications, illness)</label><textarea id="r15" name="risk_notes"></textarea></div>
        <label class="check f full"><input type="checkbox" name="consent" required> She has agreed to join MaaPushti, receive weekly calls, and share this information with her Maa Bondhu and doctors. *</label>
        <div><button class="btn pri">Register mother</button></div></form>`;
  }
  bind.register = () => {
    const f = $("#rf");
    f.lmp.onchange = () => { if (f.lmp.value) { const d = new Date(f.lmp.value + "T00:00:00"); d.setDate(d.getDate() + 280); f.edd.value = d.toISOString().slice(0, 10); } };
    f.onsubmit = async e => {
      e.preventDefault(); const v = form(f);
      const w = week(v.edd); if (w < 1 || dayDiff(v.edd) > 300) return toast("Please check the due date.");
      const row = { full_name: v.full_name.trim(), phone: v.phone.replace(/\D/g, ""), age: v.age ? +v.age : null, village: v.village.trim(), union_name: v.union_name || null, edd: v.edd, gravida: v.gravida ? +v.gravida : null,
        husband_name: v.husband_name || null, husband_phone: v.husband_phone || null, mil_name: v.mil_name || null, mil_phone: v.mil_phone || null,
        shop_id: v.shop_id || null, next_checkup: v.next_checkup || null, risk_notes: v.risk_notes || null, consent: true };
      if (v.maa_bondhu_id) row.maa_bondhu_id = v.maa_bondhu_id;
      const m = await guard(() => api.addMother(row));
      if (!m) return;
      toast(m.full_name + " registered, week " + week(m.edd));
      await guard(load); location.hash = me().role === "admin" ? "mothers" : "home"; render(); motherModal(m.id);
    };
  };

  function doctorsView() {
    const docs = D.profiles.filter(p => p.role === "doctor");
    return `<h1>Gynecologists</h1><p class="sub">Call a doctor directly, or start a video or audio consultation while you are with a mother.</p>
      ${docs.length ? `<div class="cards">${docs.map(d => `<div class="card"><div style="display:flex;gap:12px;align-items:center">${av(d, 56)}<div><b style="font-size:18px">${esc(d.full_name)}</b> ${d.available ? tag("Available", "t-ok") : tag("Busy", "t-mut")}
        <div class="note">${esc(d.specialty || "Gynecologist")}</div></div></div>
        <div class="note" style="margin-top:6px">${esc(d.hospital || "")}${loc(d) ? "<br>" + esc(loc(d)) : ""}${d.bmdc_no ? "<br>BMDC reg. " + esc(d.bmdc_no) : ""}</div>
        <div class="acts" style="margin-top:10px"><button class="btn co sm" data-consult="" data-doc="${d.id}">Video or audio consult</button><a class="btn sm" href="${telHref(callNo(d))}">Phone call</a></div></div>`).join("")}</div>` : `<p class="empty">No doctors yet. The admin adds them.</p>`}`;
  }

  // ---------- phone demo (mother's side) ----------
  let ivr = { st: "idle", mother: null, lines: [] };
  function ivrView() {
    const list = D.mothers;
    const m = byId(D.mothers, ivr.mother) || list[0]; if (m) ivr.mother = m.id;
    return `<h1>Phone demo: the mother's weekly call</h1><p class="sub">Shows what a mother hears on a basic phone. A danger sign pressed here creates a real alert for her Maa Bondhu.</p>
      ${list.length ? `<div class="tools"><label for="im" style="margin:0">Mother</label><select id="im">${list.map(x => `<option value="${x.id}" ${x.id === ivr.mother ? "selected" : ""}>${esc(x.full_name)}, week ${week(x.edd)}</option>`).join("")}</select></div>
      <div class="two"><div class="phone"><div class="scr"><div class="w">${ivr.st === "idle" ? esc(m.full_name) : "MaaPushti"}</div><div>${{ idle: "Weekly call due", ask: "On call", anc: "On call", basket: "On call", over: "Call ended" }[ivr.st]}</div><div class="big" id="ib"></div></div>
        <div class="calls"><button style="background:#2f8f5b" id="ia" ${["ask", "anc", "basket"].includes(ivr.st) ? "disabled" : ""}>Answer</button><button style="background:#c9402b" id="ie">End</button></div>
        <div class="keys">${"123456789*0#".split("").map(k => `<button data-k="${k}">${k}</button>`).join("")}</div></div>
      <div class="card"><b>Call transcript</b><ul class="tx">${ivr.lines.map(l => `<li class="${l[0]}">${esc(l[1])}</li>`).join("") || `<li>Press Answer to start the call.</li>`}</ul>
        <p class="note">Keys: 1 bleeding, 2 swelling, 3 severe headache or fits, 4 fever, 5 baby moving less, 9 all well. Then 1 to finish, and the basket choice by number.</p></div></div>` : `<p class="empty">Register a mother first.</p>`}`;
  }
  bind.ivr = () => {
    const s = $("#im"); if (!s) return;
    const m = byId(D.mothers, ivr.mother);
    const say = (c, t) => ivr.lines.push([c, t]);
    const tx = $(".tx"); if (tx) tx.scrollTop = tx.scrollHeight;
    s.onchange = () => { ivr = { st: "idle", mother: s.value, lines: [] }; render(); };
    $("#ia").onclick = () => { ivr.lines = []; ivr.st = "ask"; const w = week(m.edd);
      say("", `MaaPushti: Hello ${m.full_name.split(" ")[0]}. You are in week ${w} of your pregnancy.`);
      say("", w > 27 ? "This week: eat an egg, a bowl of dal and green vegetables every day. Rest on your left side." : "This week: eat an egg, a bowl of dal and green vegetables every day. Take your iron tablet.");
      say("", "Do you have any problem? Press 1 for bleeding, 2 for swelling, 3 for severe headache or fits, 4 for fever, 5 if the baby moves less. Press 9 if all is well.");
      render(); };
    $("#ie").onclick = () => { ivr.st = ivr.st === "idle" ? "idle" : "over"; render(); };
    document.querySelectorAll("[data-k]").forEach(b => b.onclick = async () => {
      const k = b.dataset.k; if (ivr.st === "ask") {
        if ("12345".includes(k)) { say("m", `Mother pressed ${k}: ${SIGNS[+k - 1]}`); await guard(() => api.addAlert({ mother_id: m.id, sign: SIGNS[+k - 1], source: "call" }));
          say("d", "Alert sent to her Maa Bondhu's dashboard."); say("", "MaaPushti: Your Maa Bondhu has been told and will contact you soon. If you feel worse, go to the health centre now.");
          await guard(load); ivr.st = "anc"; }
        else if (k === "9") { say("m", "Mother pressed 9: all is well."); say("", "MaaPushti: Glad to hear that."); ivr.st = "anc"; }
        if (ivr.st === "anc") say("", m.next_checkup ? `Your next checkup is on ${fmtD(m.next_checkup)}. Press 1 if you will remember.` : "Ask your Maa Bondhu for your next checkup date. Press 1 to finish.");
      } else if (ivr.st === "anc" && k === "1") { say("m", "Mother pressed 1.");
        const cur = currentOrder(m.id);
        if (!m.shop_id) { say("", "MaaPushti: Thank you. Your Maa Bondhu will help you choose a shop for the Pushti Basket. Take care."); ivr.st = "over"; }
        else if (cur) { say("", `MaaPushti: Your Pushti Basket for ${fmtDay(cur.pickup_date)} is already ordered: ${itemsText(cur).toLowerCase()}, ${cur.total} taka. Take care. We will call again next week.`); ivr.st = "over"; }
        else { say("", `MaaPushti: This Friday's Pushti Basket has eggs, dal, greens and small fish for ${BASKET} taka. Add one item? ${D.choices.slice(0, 5).map((c, i) => (i ? "" : "Press ") + (i + 1) + " for " + c.name.split(/[,:]/)[0].toLowerCase()).join(", ")}. Press 0 for no extra item. Press # if you don't want a basket this week.`); ivr.st = "basket"; }
      } else if (ivr.st === "basket" && (/[0-5]/.test(k) || k === "#")) {
        if (k === "#") { say("m", "Mother pressed #: no basket this week."); say("", "MaaPushti: All right. Take care. We will call again next week."); }
        else { const c = +k ? D.choices[+k - 1] : null; say("m", c ? `Mother pressed ${k}: ${c.name.split(":")[0]}` : "Mother pressed 0: core basket only.");
          const o = await guard(() => api.addOrder({ mother_id: m.id, items: c ? [c.code] : [], source: "call" }));
          if (o) { say("d", `Order sent to ${(byId(D.profiles, o.shop_id) || {}).shop_name || "her shop"}: ${o.total} taka, pickup ${fmtDay(o.pickup_date)}.`);
            say("", o.deposit ? `MaaPushti: Your basket costs ${o.total} taka. Please pay ${o.deposit} taka at the shop or by bKash before Wednesday to keep it. It is part of the price. Take care.` : `MaaPushti: Your basket costs ${o.total} taka. Pick it up on Friday at the shop. Take care.`);
            await guard(load); }
          else say("d", "Could not place the order.");
        }
        ivr.st = "over"; }
      render(); $("#ib").textContent = k;
    });
  };

  // ---------- basket choice and pre-orders (family, Maa Bondhu, admin) ----------
  function orderCard(o, canAct) {
    const shop = byId(D.profiles, o.shop_id) || {}, r = me().role, open = o.status === "awaiting_deposit" || o.status === "confirmed";
    const cancelOk = canAct && open && !(o.status === "confirmed" && o.deposit > 0) && !(r === "family" && Date.now() > cutoffOf(o.pickup_date).getTime() + 864e5 - 1);
    return `<div class="card order"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div><b style="font-size:18px">Basket for ${esc(fmtDay(o.pickup_date))}</b> ${ostTag(o)}<div class="note">${esc(shop.shop_name || "Village shop")} · ordered ${ago(o.created_at)} by ${esc({ family: "family", call: "phone call", maa_bondhu: "Maa Bondhu" }[o.source])}</div></div>
        <div style="text-align:right"><b style="font-size:22px">৳${o.total}</b><div class="note">${o.deposit ? `Deposit ৳${o.deposit}, part of the price` : "No deposit needed"}</div></div></div>
      <ul class="items">${CORE.map(c => `<li>${esc(c[0])}, ${esc(c[1])}</li>`).join("")}${(o.items || []).map(i => `<li class="x">${esc(i.name)} <span class="note">৳${i.price}</span></li>`).join("")}</ul>
      ${o.status === "awaiting_deposit" ? (canAct ? `<div class="soft-box"><b>Pay the BDT ${o.deposit} deposit to confirm.</b> It is the first instalment of this basket, not an extra charge.
          ${callNo(shop) ? `<br>bKash or Nagad to the shop: <b>${esc(callNo(shop))}</b>, or pay cash at the shop.` : " Pay at the shop."}
          ${o.deposit_ref ? `<p style="margin:8px 0 0">Sent by ${esc(o.deposit_method)}, reference <b>${esc(o.deposit_ref)}</b>. The shop will confirm it.</p>` : `
          <form class="grid" data-dep="${o.id}" style="margin-top:10px"><div class="f"><label>Paid by</label><select name="deposit_method"><option>bKash</option><option>Nagad</option></select></div>
            <div class="f"><label>Transaction ID</label><input name="deposit_ref" required placeholder="e.g. 8KD2XQ7"></div><div style="align-self:end"><button class="btn pri">I have paid</button></div></form>`}</div>`
          : `<p class="note">Waiting for the BDT ${o.deposit} deposit${o.deposit_ref ? ` (family says paid by ${esc(o.deposit_method)}, ref ${esc(o.deposit_ref)})` : ""}.</p>`) : ""}
      ${o.status === "missed" ? `<p class="note">Not picked up. Any deposit stays as credit for the next basket.</p>` : ""}
      ${cancelOk ? `<div class="acts" style="margin-top:10px"><button class="btn sm" data-cancel="${o.id}">Cancel this order</button></div>` : ""}</div>`;
  }
  function basketPicker(m) {
    const cur = currentOrder(m.id), pd = nextPickup(), trusted = pickups(m.id) >= 3, hist = ordersOf(m.id).filter(o => o !== cur);
    const shop = byId(D.profiles, m.shop_id);
    let body;
    if (!m.shop_id) body = `<p class="empty">No Pushti Basket shop is set for ${esc(m.full_name)} yet. ${me().role === "family" ? "Ask her Maa Bondhu to choose the nearest shop." : "Choose a shop for her first."}</p>`;
    else if (cur) body = orderCard(cur, true);
    else body = `<form id="bf" class="card">
      <p style="margin-top:0"><b>Pickup: ${esc(fmtDay(pd))}</b> at ${esc((shop && shop.shop_name) || "her village shop")}. Orders for this Friday close on <b>${esc(fmtDay(ymd(cutoffOf(pd))))}</b> night.</p>
      <h3>Always in the basket (BDT ${BASKET}) 🔒</h3>
      <ul class="items">${CORE.map(c => `<li>${esc(c[0])}, ${esc(c[1])} <span class="note">${esc(c[3])}</span></li>`).join("")}</ul>
      <p class="note" style="margin-top:0">These are the foods every pregnant mother needs, so they can't be removed.</p>
      <h3>Add her choice (up to 3)</h3>
      <div class="choices">${D.choices.map(c => `<label class="choice"><input type="checkbox" name="c" value="${c.code}" data-p="${c.price}" data-per="${c.perishable ? 1 : 0}">
        <span><b>${esc(c.name)}</b> <span class="price">+৳${c.price}</span><br><span class="note">${esc(c.why || "")}</span></span></label>`).join("")}</div>
      <div class="total"><div><b style="font-size:24px" id="bt">৳${BASKET}</b><div class="note" id="bd"></div></div><button class="btn pri">Place order</button></div></form>`;
    return body + (hist.length ? `<h2>Earlier orders</h2><div class="scroll"><table class="stack"><thead><tr><th>Pickup</th><th>Items</th><th class="num">Price</th><th>Status</th></tr></thead><tbody>
      ${hist.map(o => `<tr><td data-l="Pickup">${fmtD(o.pickup_date)}</td><td data-l="Items">${esc(itemsText(o))}</td><td class="num" data-l="Price">৳${o.total}</td><td data-l="Status">${ostTag(o)}</td></tr>`).join("")}</tbody></table></div>` : "")
      + `<p class="note" style="margin-top:14px">${trusted ? "This family has picked up 3 or more baskets, so no deposit is needed." : "A BDT 40 deposit is asked only when fresh fruit is chosen, until the family has picked up 3 baskets. The deposit is the first instalment of the price."}</p>`;
  }
  function bindBasket(root, m, after) {
    const f = root.querySelector("#bf");
    if (f) {
      const boxes = [...f.querySelectorAll("[name=c]")], trusted = pickups(m.id) >= 3;
      const upd = () => { const on = boxes.filter(b => b.checked), tot = BASKET + on.reduce((t, b) => t + +b.dataset.p, 0), dep = !trusted && on.some(b => b.dataset.per === "1");
        boxes.forEach(b => { b.disabled = !b.checked && on.length >= 3; b.closest(".choice").classList.toggle("on", b.checked); });
        f.querySelector("#bt").textContent = "৳" + tot;
        f.querySelector("#bd").textContent = dep ? "BDT 40 deposit to confirm, part of the price" : "No deposit needed"; };
      boxes.forEach(b => b.onchange = upd); upd();
      f.onsubmit = async e => { e.preventDefault(); const codes = boxes.filter(b => b.checked).map(b => b.value);
        const o = await guard(() => api.addOrder({ mother_id: m.id, items: codes, source: me().role === "family" ? "family" : "maa_bondhu" }));
        if (!o) return; toast(o.status === "awaiting_deposit" ? "Order placed. Pay the BDT 40 deposit to confirm." : "Order confirmed for " + fmtDay(o.pickup_date)); await guard(load); after(); };
    }
    root.querySelectorAll("[data-dep]").forEach(x => x.onsubmit = async e => { e.preventDefault(); const v = form(x);
      await guard(() => api.updateOrder(x.dataset.dep, { deposit_method: v.deposit_method, deposit_ref: v.deposit_ref.trim() }), "Thank you. The shop will confirm your deposit."); await guard(load); after(); });
    root.querySelectorAll("[data-cancel]").forEach(b => b.onclick = async () => { await guard(() => api.updateOrder(b.dataset.cancel, { status: "cancelled" }), "Order cancelled"); await guard(load); after(); });
  }
  function orderModal(id) {
    const m = byId(D.mothers, id); if (!m) return; openMother = id;
    const el = modal(`<h1>Pushti Basket for ${esc(m.full_name)}</h1><p class="sub">Order on her behalf, for example when nobody at home can read. <a href="#" id="bk">Back to her record</a></p>${basketPicker(m)}`);
    el.querySelector("#bk").onclick = e => { e.preventDefault(); motherModal(id); };
    bindBasket(el, m, () => orderModal(id));
  }

  // ---------- family dashboard ----------
  const fMother = () => D.mothers.find(m => m.id === me().mother_id);
  function familyHome() {
    const m = fMother(); if (!m) return `<h1>Our mother</h1><p class="empty">This login is not linked to a mother. Ask the Maa Bondhu.</p>`;
    const w = week(m.edd), mb = byId(D.profiles, m.maa_bondhu_id) || {}, shop = byId(D.profiles, m.shop_id), d = dayDiff(m.next_checkup), cur = currentOrder(m.id);
    const s = D.sales.filter(x => x.mother_id === m.id), due = s.filter(x => x.kind === "basket").reduce((t, x) => t + basketPrice(x), 0) - s.filter(x => x.kind === "payment").reduce((t, x) => t + x.amount, 0);
    const adv = D.consults.filter(c => c.mother_id === m.id && c.doctor_notes), mine = D.alerts.filter(a => a.mother_id === m.id && a.source === "family").slice(0, 3);
    const tips = w <= 13 ? ["Give her an egg, a bowl of dal and green vegetables every day.", "Make sure she takes her folic acid or iron tablet.", "If she feels sick, give small meals often."]
      : w <= 27 ? ["Give her one extra meal a day: she is eating for two.", "An egg, dal, green vegetables and small fish every day.", "Iron tablet daily; squeeze lemon on her dal so her body takes in the iron."]
      : ["Let her rest, lying on her left side.", "Keep money and transport ready for the delivery, at a health facility.", "Keep giving an egg, dal, greens and fish every day."];
    return `<h1>${esc(m.full_name)}'s family</h1><p class="sub">You are signed in as her ${esc((me().relation || "family member").toLowerCase())}. Her weekly phone call still comes to her directly.</p>
      <div class="card preg"><div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px"><div><b style="font-size:22px">Week ${w} of 40</b> <span class="note">${tri(w)} trimester</span></div><div class="note">Baby due ${fmtD(m.edd)}</div></div>
        <div class="bar"><i style="width:${Math.min(100, w / 40 * 100)}%"></i></div></div>
      <div class="kpis" style="margin-top:12px"><div class="kpi ${d != null && d < 0 ? "hot" : ""}"><b style="font-size:22px">${m.next_checkup ? fmtD(m.next_checkup) : "Ask Maa Bondhu"}</b><span>Next checkup${d != null && d < 0 ? " (overdue)" : ""}</span></div>
        <div class="kpi"><b style="font-size:22px">${cur ? OST[cur.status][0] : "Not ordered"}</b><span>Basket for ${esc(fmtDay(nextPickup()).split(",")[0])}</span></div>
        <div class="kpi"><b style="font-size:22px">${due > 0 ? "৳" + due : due < 0 ? "৳" + -due + " credit" : "Clear"}</b><span>Basket khata</span></div></div>
      <div class="two" style="margin-top:16px"><div class="card"><b>How you can help this week</b><ul>${tips.map(t => `<li>${esc(t)}</li>`).join("")}</ul>
          <a class="btn pri sm" href="#basket">${cur ? "See this week's basket" : "Order this week's basket"}</a></div>
        <div class="card"><b>Her Maa Bondhu</b><div style="display:flex;gap:12px;align-items:center;margin-top:8px">${av(mb, 48)}<div><b>${esc(mb.full_name || "-")}</b><div class="note">${esc(loc(mb))}</div></div></div>
          <div class="acts" style="margin-top:10px">${callNo(mb) ? `<a class="btn call sm" href="${telHref(callNo(mb))}">Call Maa Bondhu</a>` : ""}${shop && callNo(shop) ? `<a class="btn sm" href="${telHref(callNo(shop))}">Call ${esc(shop.shop_name || "shop")}</a>` : ""}</div></div></div>
      <h2>Danger signs: act at once</h2>
      <div class="card danger"><p style="margin-top:0">If she has any of these, tell her Maa Bondhu now. For bleeding or fits, take her to the health centre straight away.</p>
        <div class="signs">${SIGNS.map((g, i) => `<button class="btn" data-sign="${i}"><span class="num">${i + 1}</span>${esc(g)}</button>`).join("")}</div>
        ${mine.length ? `<p class="note" style="margin-bottom:0">You reported: ${mine.map(a => esc(a.sign) + " (" + ago(a.created_at) + ", " + (a.status === "open" ? "Maa Bondhu alerted" : "visited") + ")").join("; ")}</p>` : ""}</div>
      <h2>Doctor's advice</h2>${adv.length ? `<ul class="tl">${adv.map(c => `<li class="co"><b>${esc(pName(c.doctor_id))}</b>: ${esc(c.doctor_notes)}<br><small>${fmtD(c.created_at)}</small></li>`).join("")}</ul>` : `<p class="empty">No doctor consultations yet.</p>`}`;
  }
  bind.family = () => {
    const m = fMother(); if (!m) return;
    document.querySelectorAll("[data-sign]").forEach(b => b.onclick = async () => {
      const sign = SIGNS[+b.dataset.sign];
      if (!confirmBox(b, "Send \"" + sign + "\" to her Maa Bondhu?")) return;
      const a = await guard(() => api.addAlert({ mother_id: m.id, sign, source: "family", note: "Reported by " + me().full_name }));
      if (!a) return; toast("Her Maa Bondhu has been alerted and will contact you."); await guard(load); render();
    });
  };
  // two-tap confirm without a browser dialog
  function confirmBox(b, msg) { if (b.dataset.armed) return true; b.dataset.armed = "1"; b.classList.add("armed"); const t = b.innerHTML; b.innerHTML = "Tap again to send"; b.title = msg;
    setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.classList.remove("armed"); b.innerHTML = t; } }, 4000); return false; }
  function familyBasket() {
    const m = fMother(); if (!m) return `<p class="empty">This login is not linked to a mother.</p>`;
    return `<h1>Pushti Basket</h1><p class="sub">Choose what goes into ${esc(m.full_name.split(" ")[0])}'s basket this week. The core foods are always included.</p>${basketPicker(m)}`;
  }
  bind.basket = () => { const m = fMother(); if (m) bindBasket($("#main"), m, render); };

  // ---------- family logins (Maa Bondhu and admin, from the mother's record) ----------
  function familySection(m) {
    const fam = D.profiles.filter(p => p.role === "family" && p.mother_id === m.id);
    return `<h2>Family dashboard login</h2>
      ${fam.length ? `<ul class="tl">${fam.map(p => `<li><b>${esc(p.full_name)}</b> (${esc((p.relation || "family").toLowerCase())}) signs in with ${esc(p.phone)} ${p.active ? tag("Active", "t-ok") : tag("Turned off", "t-mut")}</li>`).join("")}</ul>` : `<p class="note">No family login yet. Give one only to a family member who can read.</p>`}
      <details${fam.length ? "" : " open"}><summary class="btn sm" style="display:inline-flex">+ Add family login</summary>
      <form class="grid" id="ff" style="margin-top:10px">
        <div class="f"><label for="ff1">Name *</label><input id="ff1" name="full_name" required></div>
        <div class="f"><label for="ff2">Relation</label><select id="ff2" name="relation">${RELS.map(r => `<option>${r}</option>`).join("")}</select></div>
        <div class="f"><label for="ff3">Mobile number (login) *</label><input id="ff3" name="phone" inputmode="tel" required pattern="0?1[0-9]{9}" placeholder="01XXXXXXXXX"></div>
        <div class="f"><label for="ff4">Password * (min 6)</label><input id="ff4" name="password" required minlength="6"></div>
        <label class="check f full"><input type="checkbox" required> ${esc(m.full_name)} agrees that this person can see her pregnancy details and order her basket.</label>
        <div><button class="btn pri">Create family login</button></div></form></details>`;
  }
  function bindFamilySection(el, m) {
    const f = el.querySelector("#ff"); if (!f) return;
    f.onsubmit = async e => { e.preventDefault(); const v = form(f); v.phone = v.phone.replace(/\D/g, "");
      const u = await guard(() => api.createUser({ ...v, role: "family", mother_id: m.id, area: null })); if (!u) return;
      toast(`Family login created. ${u.full_name} signs in with ${u.phone}.`); await guard(load); motherModal(m.id); };
  }

  // ---------- shopkeeper: pre-orders ----------
  let shopDay = null;
  function shopOrders() {
    const days = [...new Set(D.orders.map(o => o.pickup_date))].sort().reverse(), np = nextPickup();
    if (!days.includes(np)) days.unshift(np);
    const day = shopDay && days.includes(shopDay) ? shopDay : np;
    const list = D.orders.filter(o => o.pickup_date === day).sort((a, b) => (a.status === "cancelled") - (b.status === "cancelled") || mName(a.mother_id).localeCompare(mName(b.mother_id)));
    const live = list.filter(o => o.status !== "cancelled"), count = {};
    live.forEach(o => (o.items || []).forEach(i => { count[i.name] = (count[i.name] || 0) + 1; }));
    return `<h1>Pre-orders</h1><p class="sub">Baskets families have ordered. Orders for a Friday close on Wednesday night, so you know what to stock.</p>
      <div class="tools">${days.slice(0, 6).map(d => `<button class="chip ${d === day ? "on" : ""}" data-day="${d}">${d === np ? "This " : ""}${esc(fmtDay(d))}</button>`).join("")}</div>
      <div class="two"><div class="card soft"><b>Stock list for ${esc(fmtDay(day))}</b><ul><li><b>${live.length}</b> core baskets: ${live.length * 7} eggs, ${live.length * 0.5} kg lentils, ${live.length * 2} bunches of greens, ${live.length * 0.25} kg small fish</li>
        ${Object.entries(count).map(([n, k]) => `<li><b>${k}</b> × ${esc(n)}</li>`).join("")}</ul></div>
        <div class="kpis" style="align-content:start"><div class="kpi"><b>${live.filter(o => o.status === "awaiting_deposit").length}</b><span>Waiting for deposit</span></div><div class="kpi"><b>${live.filter(o => o.status === "confirmed").length}</b><span>Ready to hand over</span></div>
          <div class="kpi"><b>৳${live.reduce((t, o) => t + o.total, 0).toLocaleString("en-IN")}</b><span>Basket value</span></div></div></div>
      ${list.length ? `<div class="scroll" style="margin-top:12px"><table class="stack"><thead><tr><th>Family</th><th>Extras</th><th class="num">Price</th><th>Deposit</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      ${list.map(o => `<tr><td data-l="Family"><b>${esc(mName(o.mother_id))}</b><div class="note">by ${esc({ family: "family", call: "phone call", maa_bondhu: "Maa Bondhu" }[o.source])}</div></td>
        <td data-l="Extras">${esc(itemsText(o))}</td><td class="num" data-l="Price">৳${o.total}</td>
        <td data-l="Deposit">${o.deposit ? `৳${o.deposit}${o.status === "awaiting_deposit" ? (o.deposit_ref ? `<div class="note">${esc(o.deposit_method)} ref <b>${esc(o.deposit_ref)}</b></div>` : `<div class="note">Not paid yet</div>`) : `<div class="note">Received${o.deposit_method ? " by " + esc(o.deposit_method) : ""}</div>`}` : "None"}</td>
        <td data-l="Status">${ostTag(o)}</td>
        <td data-l="Actions"><div class="acts">${o.status === "awaiting_deposit" ? `${o.deposit_method ? "" : `<select data-dm="${o.id}" aria-label="Paid by" style="width:auto;min-height:36px;padding:4px 8px"><option>Cash</option><option>bKash</option><option>Nagad</option></select>`}<button class="btn sm pri" data-ok="${o.id}">Deposit received</button>`
          : o.status === "confirmed" ? `<button class="btn sm pri" data-pick="${o.id}">Picked up</button><button class="btn sm" data-miss="${o.id}">Missed</button>` : ""}</div></td></tr>`).join("")}</tbody></table></div>`
      : `<p class="empty">No orders for this day yet.</p>`}
      <p class="note">Picked up adds the basket to the family's khata at its price. The deposit counts as their first payment. Missed tells the Maa Bondhu to check on the mother; any deposit stays as credit.</p>`;
  }
  bind.orders = () => {
    document.querySelectorAll("[data-day]").forEach(b => b.onclick = () => { shopDay = b.dataset.day; render(); });
    document.querySelectorAll("[data-ok]").forEach(b => b.onclick = async () => { const s = document.querySelector(`[data-dm="${b.dataset.ok}"]`);
      await guard(() => api.updateOrder(b.dataset.ok, { status: "confirmed", ...(s ? { deposit_method: s.value } : {}) }), "Deposit received. Order confirmed."); await refresh(); });
    document.querySelectorAll("[data-pick]").forEach(b => b.onclick = async () => { await guard(() => api.updateOrder(b.dataset.pick, { status: "picked_up" }), "Basket handed over and added to the khata"); await refresh(); });
    document.querySelectorAll("[data-miss]").forEach(b => b.onclick = async () => { if (!confirmBox(b, "Mark as missed?")) return; await guard(() => api.updateOrder(b.dataset.miss, { status: "missed" }), "Marked missed. The Maa Bondhu will check on her."); await refresh(); });
  };

  // ---------- admin ----------
  function adminOverview() {
    const P = D.profiles, c = r => P.filter(p => p.role === r && p.active).length, oa = D.alerts.filter(a => a.status === "open");
    const due = D.sales.filter(s => s.kind === "basket").reduce((t, s) => t + basketPrice(s), 0) - D.sales.filter(s => s.kind === "payment").reduce((t, s) => t + s.amount, 0);
    const ow = D.orders.filter(o => o.pickup_date === nextPickup() && o.status !== "cancelled");
    return `<h1>Admin overview</h1><p class="sub">All of MaaPushti at a glance.</p>
      <div class="kpis"><div class="kpi"><b>${D.mothers.length}</b><span>Mothers registered</span></div><div class="kpi ${oa.length ? "hot" : ""}"><b>${oa.length}</b><span>Open danger signs</span></div>
      <div class="kpi"><b>${c("maa_bondhu")}</b><span>Maa Bondhus</span></div><div class="kpi"><b>${c("doctor")}</b><span>Gynecologists</span></div><div class="kpi"><b>${c("shopkeeper")}</b><span>Shops</span></div>
      <div class="kpi"><b>${D.consults.length}</b><span>Consultations</span></div><div class="kpi"><b>${D.sales.filter(s => s.kind === "basket").length}</b><span>Baskets sold</span></div><div class="kpi"><b>৳${due.toLocaleString("en-IN")}</b><span>Basket payments due</span></div>
      <div class="kpi"><b>${ow.length}</b><span>Orders for ${esc(fmtDay(nextPickup()).split(",")[0])}</span></div><div class="kpi"><b>${c("family")}</b><span>Family logins</span></div></div>
      <h2>Open danger-sign alerts</h2>${alertList(oa)}`;
  }
  function adminUsers() {
    const P = D.profiles;
    return `<h1>Users</h1><p class="sub">Create logins for Maa Bondhus, shopkeepers and gynecologists. Each person signs in with their phone number and the password you set. Family logins are made from the mother's page, with her consent.</p>
      <form class="grid card" id="uf">
        <div class="f"><label for="u1">Role *</label><select id="u1" name="role"><option value="maa_bondhu">Maa Bondhu (health worker)</option><option value="shopkeeper">Shopkeeper</option><option value="doctor">Gynecologist</option><option value="admin">Admin</option></select></div>
        <div class="f"><label for="u2">Full name *</label><input id="u2" name="full_name" required></div>
        <div class="f"><label for="u3">Mobile number (login) *</label><input id="u3" name="phone" inputmode="tel" required placeholder="01XXXXXXXXX" pattern="0?1[0-9]{9}"></div>
        <div class="f"><label for="u4">Password * (min 6)</label><input id="u4" name="password" required minlength="6"></div>
        <div class="f full" data-for="maa_bondhu shopkeeper doctor"><div class="fgrid">${geoBlock()}</div></div>
        <div class="f" data-for="shopkeeper"><label for="u6">Shop name</label><input id="u6" name="shop_name"></div>
        <div class="f" data-for="doctor"><label for="u7">Specialty</label><input id="u7" name="specialty" value="Gynecologist and obstetrician"></div>
        <div class="f" data-for="doctor"><label for="u8">Hospital or chamber</label><input id="u8" name="hospital"></div>
        <div class="f" data-for="doctor"><label for="u9">BMDC registration no.</label><input id="u9" name="bmdc_no"></div>
        <div><button class="btn pri">Create login</button></div></form>
      <h2>All users (${P.length})</h2><div class="scroll"><table class="stack"><thead><tr><th>Name</th><th>Role</th><th>Phone (login)</th><th>Details</th><th class="num">Mothers</th><th>Status</th><th></th></tr></thead><tbody>
      ${P.map(p => `<tr><td data-l="Name"><b>${esc(p.full_name)}</b></td><td data-l="Role">${ROLE[p.role]}</td><td data-l="Phone">${esc(p.phone)}</td>
        <td data-l="Details">${p.role === "family" ? "Family of " + esc(mName(p.mother_id)) + (p.relation ? " (" + esc(p.relation.toLowerCase()) + ")" : "") : [p.shop_name || p.hospital, loc(p)].filter(Boolean).map(esc).join("<br>")}</td><td class="num" data-l="Mothers">${p.role === "maa_bondhu" ? D.mothers.filter(m => m.maa_bondhu_id === p.id).length : p.role === "shopkeeper" ? D.mothers.filter(m => m.shop_id === p.id).length : ""}</td>
        <td data-l="Status">${p.active ? tag("Active", "t-ok") : tag("Turned off", "t-mut")}</td>
        <td data-l=""><div class="acts"><button class="btn sm" data-edit="${p.id}">Edit</button>${p.id !== me().id ? `<button class="btn sm" data-tog="${p.id}">${p.active ? "Turn off" : "Turn on"}</button>` : ""}</div></td></tr>`).join("")}</tbody></table></div>`;
  }
  bind.users = () => {
    const f = $("#uf");
    const sync = () => document.querySelectorAll("[data-for]").forEach(x => x.hidden = !x.dataset.for.split(" ").includes(f.role.value));
    f.role.onchange = sync; sync(); bindGeo(f);
    f.onsubmit = async e => {
      e.preventDefault(); const v = form(f); v.phone = v.phone.replace(/\D/g, "");
      if (v.role !== "admin") { const err = geoCheck(f, v.role !== "doctor"); if (err) return toast(err); v.area = areaOf(v); }
      else ["division", "district", "upazila", "union_name"].forEach(k => delete v[k]);
      const u = await guard(() => api.createUser(v)); if (!u) return;
      toast(`Login created. ${u.full_name} signs in with ${u.phone} and the password you set.`); await guard(load); render();
    };
    document.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => editUserModal(b.dataset.edit));
    document.querySelectorAll("[data-tog]").forEach(b => b.onclick = async () => { const p = byId(D.profiles, b.dataset.tog); await guard(() => api.updateProfile(p.id, { active: !p.active }), p.active ? "Login turned off" : "Login turned on"); await refresh(); });
  };
  function adminMothers() {
    const mbs = D.profiles.filter(p => p.role === "maa_bondhu"), shops = D.profiles.filter(p => p.role === "shopkeeper");
    let list = D.mothers; if (q) list = list.filter(m => (m.full_name + " " + m.village + " " + pName(m.maa_bondhu_id)).toLowerCase().includes(q));
    return `<h1>Mothers</h1><p class="sub">Every registered mother. Change who looks after her or which shop serves her.</p>
      <div class="tools"><input id="q" type="search" placeholder="Search name, village or Maa Bondhu" value="${esc(q)}" aria-label="Search"><a class="btn pri" href="#register" id="areg">+ Register mother</a></div>
      ${list.length ? `<div class="scroll"><table class="stack"><thead><tr><th>Mother</th><th>Village</th><th class="num">Week</th><th>Status</th><th>Maa Bondhu</th><th>Shop</th></tr></thead><tbody>
      ${list.map(m => `<tr><td data-l="Mother"><a href="#" data-open="${m.id}"><b>${esc(m.full_name)}</b></a></td><td data-l="Village">${esc(m.village)}</td><td class="num" data-l="Week">${week(m.edd)}</td><td data-l="Status">${status(m)}</td>
        <td data-l="Maa Bondhu"><select data-mb="${m.id}" aria-label="Maa Bondhu">${mbs.map(p => `<option value="${p.id}" ${p.id === m.maa_bondhu_id ? "selected" : ""}>${esc(p.full_name)}</option>`).join("")}</select></td>
        <td data-l="Shop"><select data-shop="${m.id}" aria-label="Shop"><option value="">None</option>${shops.map(p => `<option value="${p.id}" ${p.id === m.shop_id ? "selected" : ""}>${esc(p.shop_name || p.full_name)}</option>`).join("")}</select></td></tr>`).join("")}</tbody></table></div>` : `<p class="empty">No mothers yet.</p>`}`;
  }
  bind.mothers = () => {
    const s = $("#q"); s.oninput = () => { q = s.value.trim().toLowerCase(); const p = s.selectionStart; render(); const n = $("#q"); n.focus(); n.setSelectionRange(p, p); };
    $("#areg").onclick = e => { e.preventDefault(); shell(registerView()); bind.register(); };
    document.querySelectorAll("[data-mb]").forEach(x => x.onchange = async () => { await guard(() => api.updateMother(x.dataset.mb, { maa_bondhu_id: x.value }), "Maa Bondhu changed"); await refresh(); });
    document.querySelectorAll("[data-shop]").forEach(x => x.onchange = async () => { await guard(() => api.updateMother(x.dataset.shop, { shop_id: x.value || null }), "Shop changed"); await refresh(); });
  };

  // ---------- shopkeeper ----------
  function ledgerRows() {
    return D.customers.map(c => { const s = D.sales.filter(x => x.mother_id === c.id), b = s.filter(x => x.kind === "basket").length, paid = s.filter(x => x.kind === "payment").reduce((t, x) => t + x.amount, 0); return { ...c, b, paid, due: s.filter(x => x.kind === "basket").reduce((t, x) => t + basketPrice(x), 0) - paid }; });
  }
  function shopRecord() {
    const rows = ledgerRows(), sold = rows.reduce((t, r) => t + r.b, 0), paid = rows.reduce((t, r) => t + r.paid, 0);
    return `<h1>${esc(me().shop_name || "My shop")}</h1><p class="sub">Record Pushti Baskets and instalments. You see only the families assigned to your shop, not their health details.</p>
      <div class="kpis"><div class="kpi"><b>${rows.length}</b><span>Families</span></div><div class="kpi"><b>${sold}</b><span>Baskets given</span></div><div class="kpi"><b>৳${paid.toLocaleString("en-IN")}</b><span>Collected</span></div><div class="kpi"><b>৳${Math.round(D.sales.filter(x => x.kind === "basket").reduce((t, x) => t + basketPrice(x), 0) * 0.1).toLocaleString("en-IN")}</b><span>Your margin (10%)</span></div></div>
      <div class="two" style="margin-top:16px"><form class="card" id="sf">
        <div class="f"><label for="s1">Family</label><select id="s1" name="mother_id" required>${rows.map(r => `<option value="${r.id}">${esc(r.full_name)}, ${esc(r.village)}</option>`).join("")}</select></div>
        <div class="f" style="margin-top:10px"><label for="s2">Type</label><select id="s2" name="kind"><option value="basket">Basket given (BDT 280 added to due)</option><option value="payment">Payment received</option></select></div>
        <div class="f" style="margin-top:10px"><label for="s3">Amount received (BDT)</label><input id="s3" name="amount" type="number" min="0" step="10" value="0"></div>
        <div class="acts" style="margin-top:8px">${[40, 70, 140, 280].map(a => `<button type="button" class="chip" data-a="${a}">৳${a}</button>`).join("")}</div>
        <div class="f" style="margin-top:10px"><label for="s4">Paid by</label><select id="s4" name="method"><option>bKash</option><option>Nagad</option><option>Cash</option></select></div>
        <button class="btn pri" style="margin-top:12px" ${rows.length ? "" : "disabled"}>Save</button></form>
      <div class="card soft"><b>Core Pushti Basket: BDT 280</b><ul>${CORE.map(c => `<li>${c[0]}, ${c[1]} (BDT ${c[2]})</li>`).join("")}</ul>
        <b>Extras families can choose</b><ul>${D.choices.map(c => `<li>${esc(c.name)} (BDT ${c.price})</li>`).join("")}</ul><p class="note">Walk-in sale without a pre-order: record it here. Pre-ordered baskets are handed over from the Pre-orders tab. Sample prices.</p></div></div>`;
  }
  bind.record = () => {
    const f = $("#sf"); if (!f) return;
    document.querySelectorAll("[data-a]").forEach(b => b.onclick = () => { f.amount.value = b.dataset.a; f.kind.value = "payment"; });
    f.kind.onchange = () => { if (f.kind.value === "basket") f.amount.value = 0; };
    f.onsubmit = async e => {
      e.preventDefault(); const v = form(f), amt = Math.max(0, +v.amount || 0);
      if (v.kind === "payment" && !amt) return toast("Enter the amount received.");
      await guard(async () => {
        await api.addSale({ mother_id: v.mother_id, kind: v.kind, amount: v.kind === "payment" ? amt : 0, method: v.kind === "payment" ? v.method : null });
        if (v.kind === "basket" && amt) await api.addSale({ mother_id: v.mother_id, kind: "payment", amount: amt, method: v.method });
      }, "Saved for " + mName(v.mother_id));
      await refresh();
    };
  };
  function shopLedger() {
    const rows = ledgerRows().sort((a, b) => b.due - a.due);
    return `<h1>Khata</h1><p class="sub">What each family has bought and still owes.</p>
      ${rows.length ? `<div class="scroll"><table class="stack"><thead><tr><th>Family</th><th>Village</th><th class="num">Baskets</th><th class="num">Paid</th><th class="num">Due</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td data-l="Family"><b>${esc(r.full_name)}</b></td><td data-l="Village">${esc(r.village)}</td><td class="num" data-l="Baskets">${r.b}</td><td class="num" data-l="Paid">৳${r.paid}</td><td class="num" data-l="Due">${r.due > 0 ? `<b style="color:var(--red)">৳${r.due}</b>` : r.due < 0 ? `৳${-r.due} credit` : "Clear"}</td></tr>`).join("")}</tbody></table></div>
      <h2>Recent entries</h2><ul class="tl">${D.sales.slice(0, 12).map(s => `<li>${esc(mName(s.mother_id))}: ${s.kind === "basket" ? "basket given" : "paid ৳" + s.amount + " by " + esc(s.method)}<br><small>${ago(s.created_at)}</small></li>`).join("")}</ul>` : `<p class="empty">No families are assigned to your shop yet.</p>`}`;
  }

  // ---------- doctor ----------
  function consultCard(c, active) {
    const m = byId(D.mothers, c.mother_id) || {}, mb = byId(D.profiles, c.maa_bondhu_id) || {}, al = openAlerts(c.mother_id);
    return `<div class="card" style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
      <div><b style="font-size:18px">${esc(m.full_name)}</b> · week ${m.edd ? week(m.edd) : "-"} · ${esc(m.village || "")} ${tag(c.status, c.status === "requested" ? "t-red" : c.status === "done" ? "t-ok" : "t-co")}
      <div class="note">${c.mode === "video" ? "Video" : "Audio"} call requested ${ago(c.created_at)} by ${esc(mb.full_name || "Maa Bondhu")}</div></div>
      ${active ? `<div class="acts"><a class="btn co" href="${meetUrl(c, me().full_name)}" target="_blank" rel="noopener" data-join="${c.id}">Join ${c.mode} call</a>${callNo(mb) ? `<a class="btn" href="${telHref(callNo(mb))}">Phone Maa Bondhu</a>` : ""}</div>` : ""}</div>
      <p><b>Reason:</b> ${esc(c.reason || "-")}</p>
      ${m.risk_notes ? `<p><b>Health notes:</b> ${esc(m.risk_notes)}</p>` : ""}${al.length ? `<p><b style="color:var(--red)">Open danger signs:</b> ${al.map(a => esc(a.sign)).join(", ")}</p>` : ""}
      <p class="note">Age ${esc(m.age || "-")} · Pregnancy no. ${esc(m.gravida || "-")} · Due ${fmtD(m.edd)} · <a href="#" data-open="${m.id}">Full history</a></p>
      ${active ? `<form data-done="${c.id}"><div class="f"><label for="dn${c.id}">Advice for the Maa Bondhu</label><textarea id="dn${c.id}" name="notes">${esc(c.doctor_notes || "")}</textarea></div>
        <div class="acts" style="margin-top:8px"><button class="btn pri">Save advice and finish</button>${c.status === "requested" ? `<button type="button" class="btn" data-decline="${c.id}">Can't take it</button>` : ""}</div></form>` : c.doctor_notes ? `<p><b>Your advice:</b> ${esc(c.doctor_notes)}</p>` : ""}</div>`;
  }
  function docRequests() {
    const u = me(), list = D.consults.filter(c => c.doctor_id === u.id && ["requested", "active"].includes(c.status));
    return `<h1>Consultation requests</h1><p class="sub">Maa Bondhus call you from the mother's home. Join the call, then write your advice.</p>
      <div class="tools"><label class="check" style="margin:0"><input type="checkbox" id="av" ${u.available ? "checked" : ""}> Available for calls now</label></div>
      ${list.length ? list.map(c => consultCard(c, true)).join("") : `<p class="empty">No waiting requests. New ones appear here automatically.</p>`}`;
  }
  bind.requests = () => {
    $("#av").onchange = async e => { await guard(() => api.updateProfile(me().id, { available: e.target.checked }), e.target.checked ? "You are available" : "You are marked busy"); };
    document.querySelectorAll("[data-join]").forEach(b => b.addEventListener("click", () => guard(() => api.updateConsult(b.dataset.join, { status: "active" }))));
    document.querySelectorAll("[data-done]").forEach(f => f.onsubmit = async e => { e.preventDefault(); await guard(() => api.updateConsult(f.dataset.done, { status: "done", doctor_notes: f.notes.value }), "Advice saved"); await refresh(); });
    document.querySelectorAll("[data-decline]").forEach(b => b.onclick = async () => { await guard(() => api.updateConsult(b.dataset.decline, { status: "declined" }), "Request declined"); await refresh(); });
  };
  function docHistory() {
    const list = D.consults.filter(c => c.doctor_id === me().id && ["done", "declined"].includes(c.status));
    return `<h1>History</h1><p class="sub">Consultations you have finished.</p>${list.length ? list.map(c => consultCard(c, false)).join("") : `<p class="empty">No finished consultations yet.</p>`}`;
  }
  // ---------- profiles ----------
  const roleFields = p => p.role === "doctor" ? `<div class="f"><label for="e5">Specialty</label><input id="e5" name="specialty" value="${esc(p.specialty || "")}"></div>
      <div class="f"><label for="e6">Hospital or chamber</label><input id="e6" name="hospital" value="${esc(p.hospital || "")}"></div>
      <div class="f"><label for="e7">BMDC registration no.</label><input id="e7" name="bmdc_no" value="${esc(p.bmdc_no || "")}"></div>`
    : p.role === "shopkeeper" ? `<div class="f"><label for="e8">Shop name</label><input id="e8" name="shop_name" value="${esc(p.shop_name || "")}"></div>` : "";
  function profileView() {
    const u = me();
    const stats = u.role === "doctor" ? `<div class="kpis" style="margin-top:16px"><div class="kpi"><b>${D.consults.filter(c => c.doctor_id === u.id && c.status === "done").length}</b><span>Consultations finished</span></div><div class="kpi"><b>${new Set(D.consults.filter(c => c.doctor_id === u.id).map(c => c.mother_id)).size}</b><span>Mothers helped</span></div></div>` : "";
    return `<h1>My profile</h1><p class="sub">${u.role === "doctor" ? "Maa Bondhus see these details when choosing a doctor." : "Keep your photo and contact numbers up to date."}</p>
      <div class="card" style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">${av(u, 112)}
        <div><b style="font-size:20px">${esc(u.full_name)}</b><div class="note">${ROLE[u.role]}${loc(u) ? " · " + esc(loc(u)) : ""}</div>
        <div class="acts" style="margin-top:10px"><label class="btn sm" for="ph" style="color:var(--ink)">Change photo</label><input id="ph" type="file" accept="image/*" hidden>${u.photo ? `<button class="btn sm" id="phx">Remove photo</button>` : ""}</div></div></div>
      <h2>Details you can change</h2>
      <form class="grid card" id="mf">
        <div class="f"><label for="e1">Full name</label><input id="e1" name="full_name" value="${esc(u.full_name)}" required></div>
        <div class="f"><label for="e2">Contact number</label><input id="e2" name="contact_phone" inputmode="tel" value="${esc(u.contact_phone || u.phone)}" required pattern="0?1[0-9]{9}"></div>
        <div class="f"><label for="e3">Alternate number</label><input id="e3" name="alt_phone" inputmode="tel" value="${esc(u.alt_phone || "")}" pattern="0?1[0-9]{9}"></div>
        ${roleFields(u)}
        <div><button class="btn pri">Save changes</button></div></form>
      <h2>Account details</h2>
      <div class="card kv" style="margin:0"><div><span>Login ID (phone)</span>${esc(u.phone)} 🔒</div><div><span>User ID</span><code style="font-size:13px">${esc(u.id.slice(0, 8))}</code> 🔒</div>
        <div><span>Role</span>${ROLE[u.role]} 🔒</div>${u.role === "family" ? `<div><span>Linked to</span>${esc(mName(u.mother_id))} 🔒</div>` : `<div><span>Location</span>${esc(loc(u) || "-")} 🔒</div>`}</div>
      <p class="note">🔒 These can't be changed here. Your login ID stays the same; ask the admin to change your role or location.</p>
      <h2>Change password</h2>
      <form class="grid card" id="pw"><div class="f"><label for="w1">New password (min 6)</label><input id="w1" name="p1" type="password" minlength="6" autocomplete="new-password" required></div>
        <div class="f"><label for="w2">Type it again</label><input id="w2" name="p2" type="password" minlength="6" autocomplete="new-password" required></div>
        <div><button class="btn">Change password</button></div></form>${stats}`;
  }
  bind.me = () => {
    const u = me();
    $("#ph").onchange = async e => { const f = e.target.files[0]; if (!f) return; const ph = await guard(() => toPhoto(f)); if (!ph) return; await guard(() => api.updateProfile(u.id, { photo: ph }), "Photo updated"); await guard(load); render(); };
    const x = $("#phx"); if (x) x.onclick = async () => { await guard(() => api.updateProfile(u.id, { photo: null }), "Photo removed"); await guard(load); render(); };
    $("#mf").onsubmit = async e => { e.preventDefault(); const v = form(e.target); v.contact_phone = v.contact_phone.replace(/\D/g, ""); v.alt_phone = v.alt_phone ? v.alt_phone.replace(/\D/g, "") : null;
      await guard(() => api.updateProfile(u.id, v), "Profile saved"); await guard(load); render(); };
    $("#pw").onsubmit = async e => { e.preventDefault(); const v = form(e.target); if (v.p1 !== v.p2) return toast("The two passwords don't match.");
      const ok = await guard(() => api.changePassword(v.p1), "Password changed"); e.target.reset(); };
  };
  function editUserModal(id) {
    const p = byId(D.profiles, id); if (!p) return;
    const el = modal(`<h1>Edit ${esc(p.full_name)}</h1><p class="sub">${ROLE[p.role]} · login ID ${esc(p.phone)} (can't be changed)</p>
      <form class="grid" id="ef">
        <div class="f"><label for="x1">Full name</label><input id="x1" name="full_name" value="${esc(p.full_name)}" required></div>
        <div class="f"><label for="x2">Contact number</label><input id="x2" name="contact_phone" inputmode="tel" value="${esc(p.contact_phone || p.phone)}"></div>
        <div class="f"><label for="x3">Alternate number</label><input id="x3" name="alt_phone" inputmode="tel" value="${esc(p.alt_phone || "")}"></div>
        ${roleFields(p)}${p.role !== "admin" ? `<div class="f full"><div class="fgrid">${geoBlock()}</div></div>` : ""}
        <div><button class="btn pri">Save</button></div></form>`);
    const f = el.querySelector("#ef"); if (p.role !== "admin") bindGeo(f, p);
    f.onsubmit = async e => { e.preventDefault(); const v = form(f);
      if (p.role !== "admin") { const err = geoCheck(f, p.role !== "doctor"); if (err) return toast(err); v.area = areaOf(v); }
      await guard(() => api.updateProfile(id, v), "Saved"); await guard(load); closeModal(); };
  }

  // ---------- boot ----------
  async function start() {
    await guard(load);
    if (me().role === "admin") await geo().catch(() => toast("Could not load the area list."));
    seenReq = new Set(D.consults.map(c => c.id));
    render();
    if (unsub) unsub();
    unsub = api.subscribe(async () => {
      if (!me()) return;
      const before = D.alerts.filter(a => a.status === "open").length;
      await load().catch(() => {});
      const fresh = D.consults.filter(c => !seenReq.has(c.id) && c.doctor_id === me().id && c.status === "requested");
      fresh.forEach(c => seenReq.add(c.id));
      if (fresh.length) toast("New consultation request from " + pName(fresh[0].maa_bondhu_id));
      else if (D.alerts.filter(a => a.status === "open").length > before) toast("New danger-sign alert");
      const busy = document.activeElement && ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName);
      if (!busy && !$(".modal")) render();
    });
  }
  window.addEventListener("hashchange", () => { if (me()) { q = ""; render(); } });
  (async () => { const p = await api.restore().catch(() => null); if (p) start(); else loginView(); })();
})();
