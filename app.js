/* Fitness Tracker — phase 2: sign-in, Profile + calorie engine, Diary with food search, barcode, quick add. */
(() => {
  "use strict";
  const CFG = window.FM_CONFIG;
  const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });

  const MEALS = [["breakfast", "Breakfast"], ["lunch", "Lunch"], ["snacks", "Snacks"], ["dinner", "Dinner"]];
  const MEAL = Object.fromEntries(MEALS);
  const FACTORS = [[1.2, "Desk job"], [1.3, "Light"], [1.4, "On my feet"]];

  // ================= helpers =================
  const $ = id => document.getElementById(id);
  const app = () => $("app");
  const pad = n => String(n).padStart(2, "0");
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const today = () => iso(new Date());
  const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
  const r1 = n => Math.round(n * 10) / 10;
  const r10 = n => Math.round(n / 10) * 10;
  const fmt = n => Math.round(n || 0).toLocaleString("en-GB");
  const num = v => { if (v == null || v === "") return null; const n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : null; };
  const n0 = v => (v == null || !isFinite(v)) ? 0 : Number(v);

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "html") el.innerHTML = v;
      else if (k === "style") el.style.cssText = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "value") el.value = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    kids.flat().forEach(c => { if (c == null || c === false) return; el.append(c.nodeType ? c : String(c)); });
    return el;
  }
  function toast(t) {
    let el = $("toast");
    if (!el) { el = h("div", { id: "toast", class: "toast", role: "status" }); document.body.append(el); }
    el.textContent = t; el.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 2400);
  }
  function seg(items, cur, onPick) {
    const el = h("div", { class: "seg", role: "group" });
    const draw = () => { el.innerHTML = ""; items.forEach(([v, l]) => el.append(h("button", { type: "button", "aria-pressed": String(String(v) === String(cur)), text: l, onclick: () => { cur = v; draw(); onPick(v); } }))); };
    draw();
    return el;
  }
  const field = (label, input) => h("label", { class: "f" }, label, input);
  const textIn = (val, attrs = {}) => h("input", Object.assign({ class: "in-text", type: "text", value: val == null ? "" : String(val), autocomplete: "off" }, attrs));
  const numIn = (val, ph, mode = "decimal") => textIn(val, { inputmode: mode, placeholder: ph || "" });
  function armDelete(btn, fn) {
    btn.addEventListener("click", () => {
      if (btn.classList.contains("armed")) return fn();
      btn.classList.add("armed"); btn.textContent = "Delete";
      setTimeout(() => { if (btn.isConnected) { btn.classList.remove("armed"); btn.textContent = "✕"; } }, 3000);
    });
    return btn;
  }
  const errText = e => {
    const m = String((e && (e.message || e.error_description)) || e || "");
    if (/fetch|network|load failed/i.test(m)) return "No connection. Check your internet and try again.";
    return m || "Something went wrong. Try again.";
  };

  const ICON = {
    apple: `<svg width="84" height="84" viewBox="20 16 80 86" aria-hidden="true"><path d="M60 40c-8-8-30-8-32 16-2 22 14 42 24 42 4 0 6-2 8-2s4 2 8 2c10 0 26-20 24-42-2-24-24-24-32-16z" fill="#fa114f"/><path d="M60 40c0-8 4-14 10-18" fill="none" stroke="#2fa84f" stroke-width="5" stroke-linecap="round"/><path d="M30 66h14l6-10 8 20 6-14h26" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    diary: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 3v8a3 3 0 0 0 6 0V3M7 3v18M17 3c-2 2-3 5-3 8h4v10"/></svg>`,
    activity: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>`,
    weight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 9a5 5 0 0 1 8 0M12 9l1.5-2"/></svg>`,
    user: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>`,
    scan: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M10 8v8M13 8v8M17 8v8"/></svg>`
  };

  // ================= state =================
  const S = { user: null, profile: null, weights: [], day: today(), tab: "diary", entries: [], yEntries: [], workouts: [] };

  // ================= calorie engine (see spec) =================
  function ageOn(birth, dateStr) {
    const b = parse(birth), d = parse(dateStr);
    let a = d.getFullYear() - b.getFullYear();
    if (d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())) a--;
    return a;
  }
  function weightOn(dateStr) {
    const w = S.weights.filter(x => x.date <= dateStr);
    if (w.length) return Number(w[w.length - 1].kg);
    return S.profile && S.profile.start_weight_kg ? Number(S.profile.start_weight_kg) : null;
  }
  function goalsFor(p, kg, dateStr) {
    if (!p || !p.sex || !p.birth_date || !p.height_cm || !kg) return null;
    const age = ageOn(p.birth_date, dateStr);
    const bmr = 10 * kg + 6.25 * Number(p.height_cm) - 5 * age + (p.sex === "male" ? 5 : -161);
    const tdee = bmr * Number(p.activity_factor || 1.3);
    let sugDef = 0, tooFast = false, days = null, raw = 0;
    if (p.target_weight_kg && p.target_date) {
      days = Math.max(1, daysBetween(dateStr, p.target_date));
      raw = (kg - Number(p.target_weight_kg)) * 7700 / days;
      const capLoss = Math.min(0.25 * tdee, 0.01 * kg * 7700 / 7);
      const capGain = 0.15 * tdee;
      if (raw > 0) { sugDef = Math.min(raw, capLoss); tooFast = raw > capLoss; }
      else { sugDef = Math.max(raw, -capGain); tooFast = -raw > capGain; }
    }
    sugDef = r10(sugDef);
    const deficit = p.deficit_override != null ? Number(p.deficit_override) : sugDef;
    const floor = p.sex === "male" ? 1500 : 1200;
    const sugKcal = Math.max(floor, r10(tdee - deficit));
    const kcal = p.kcal_override != null ? Number(p.kcal_override) : sugKcal;
    const sugProtein = Math.round(1.5 * kg);
    const protein = p.protein_override != null ? Number(p.protein_override) : sugProtein;
    const sugFat = Math.round(kcal * 0.28 / 9);
    const fat = p.fat_override != null ? Number(p.fat_override) : sugFat;
    const sugCarbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
    const carbs = p.carbs_override != null ? Number(p.carbs_override) : sugCarbs;
    return { age, bmr: Math.round(bmr), tdee: Math.round(tdee), days, tooFast, floorHit: tdee - deficit < floor, floor,
      sug: { deficit: sugDef, kcal: sugKcal, protein: sugProtein, fat: sugFat, carbs: sugCarbs },
      deficit, kcal, protein, fat, carbs, fibre: Number(p.fibre_g || 30) };
  }

  // ================= auth =================
  function renderAuth() {
    let mode = "in";
    const root = app(); root.innerHTML = "";
    const userRow = field("Username", textIn("", { autocapitalize: "off", spellcheck: "false", autocomplete: "username", maxlength: "30" }));
    const idIn = textIn("", { autocapitalize: "off", spellcheck: "false", autocomplete: "username" });
    const idLabel = field("Username or email", idIn);
    const emailIn = textIn("", { type: "email", autocapitalize: "off", spellcheck: "false", autocomplete: "email" });
    const emailRow = field("Email", emailIn);
    const pwIn = textIn("", { type: "password", autocomplete: "current-password" });
    const msg = h("div", { class: "msg", role: "status" });
    const go = h("button", { class: "btn", type: "submit", text: "Sign in" });
    const say = (t, err) => { msg.textContent = t; msg.className = "msg" + (err ? " err" : ""); };
    const setMode = m => {
      mode = m;
      userRow.hidden = emailRow.hidden = m !== "up";
      idLabel.hidden = m === "up";
      pwIn.autocomplete = m === "up" ? "new-password" : "current-password";
      go.textContent = m === "up" ? "Create account" : "Sign in";
      say("");
    };
    const form = h("form", { novalidate: true, style: "display:grid;gap:12px" }, userRow, idLabel, emailRow, field("Password", pwIn), go, msg);
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const pw = pwIn.value;
      if (pw.length < 8) return say("Use a password of at least 8 characters.", true);
      go.disabled = true;
      try {
        if (mode === "up") {
          const username = userRow.querySelector("input").value.trim(), email = emailIn.value.trim();
          if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(username)) throw new Error("Username: 3–30 letters, numbers, dots, dashes or underscores.");
          if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter your email address.");
          const { error } = await sb.auth.signUp({ email, password: pw, options: { data: { username }, emailRedirectTo: location.origin + location.pathname } });
          if (error) throw error;
          setMode("in"); say("Check your email and tap the confirmation link, then sign in here.");
        } else {
          let id = idIn.value.trim();
          if (!id) throw new Error("Enter your username or email.");
          if (!id.includes("@")) {
            const { data, error } = await sb.rpc("email_for_username", { p_username: id });
            if (error) throw error;
            if (!data) throw new Error("Username or password doesn't match.");
            id = data;
          }
          const { error } = await sb.auth.signInWithPassword({ email: id, password: pw });
          if (error) throw error;
        }
      } catch (err) {
        const m = String(err && err.message || "");
        say(/confirm/i.test(m) ? "Confirm your email first: tap the link we sent you." :
            /invalid login/i.test(m) ? "Username or password doesn't match." :
            /already registered/i.test(m) ? "That email already has an account. Sign in instead." : errText(err), true);
      } finally { go.disabled = false; }
    });
    root.append(h("main", { class: "auth" },
      h("div", { class: "logo", html: ICON.apple }),
      h("h1", { text: "Fitness Tracker" }),
      h("section", { class: "card" },
        seg([["in", "Sign in"], ["up", "Create account"]], "in", setMode), form)));
    setMode("in");
  }

  // ================= data =================
  async function loadProfile() {
    const uid = S.user.id;
    const [{ data: p, error: e1 }, { data: w, error: e2 }] = await Promise.all([
      sb.from("profiles").select("*").eq("user_id", uid).maybeSingle(),
      sb.from("weights").select("date,kg").order("date")
    ]);
    if (e1) throw e1; if (e2) throw e2;
    S.profile = p; S.weights = w || [];
  }
  async function loadDay() {
    const y = iso(addDays(parse(S.day), -1));
    const [{ data: e, error: e1 }, { data: wk, error: e2 }] = await Promise.all([
      sb.from("diary_entries").select("*").in("date", [S.day, y]).order("created_at"),
      sb.from("workouts").select("kcal,minutes,type").eq("date", S.day)
    ]);
    if (e1) throw e1; if (e2) throw e2;
    S.entries = (e || []).filter(x => x.date === S.day);
    S.yEntries = (e || []).filter(x => x.date === y);
    S.workouts = wk || [];
  }

  // ================= main shell =================
  function renderMain() {
    const root = app(); root.innerHTML = "";
    const t = today(), d = parse(S.day);
    const lbl = S.day === t ? "Today" : S.day === iso(addDays(new Date(), -1)) ? "Yesterday" : d.toLocaleDateString("en-GB", { weekday: "long" });
    const top = h("div", { class: "topbar" },
      h("button", { class: "iconbtn", "aria-label": "Previous day", text: "‹", onclick: () => go(-1) }),
      h("button", { class: "daybtn", "aria-label": "Open calendar", onclick: calendarSheet },
        h("span", { class: "lbl", text: lbl }), h("span", { class: "ttl", text: d.toLocaleDateString("en-GB", { day: "numeric", month: "long" }) + " ▾" })),
      h("button", { class: "iconbtn", "aria-label": "Next day", text: "›", disabled: S.day >= t, onclick: () => go(1) }),
      h("button", { class: "iconbtn", "aria-label": "Profile", html: ICON.user, onclick: () => profileSheet(false) }));
    const view = h("div", { id: "view", style: "display:grid;gap:12px" });
    root.append(h("main", { class: "page" }, top, view), tabs());
    if (S.tab === "diary") renderDiary(view);
    else view.append(h("div", { class: "card" }, h("h2", { text: S.tab === "activity" ? "Activity" : "Weight" }),
      h("p", { class: "muted", style: "margin:0", text: S.tab === "activity" ? "Workouts and Watch steps arrive in phase 4." : "Weigh-ins, trend and photos arrive in phase 5. Your current weight is kept in Profile for now." })));
  }
  function tabs() {
    const b = (id, label) => h("button", { "aria-current": S.tab === id ? "page" : null, html: ICON[id] + `<span>${label}</span>`, onclick: () => { S.tab = id; renderMain(); window.scrollTo(0, 0); } });
    return h("nav", { class: "tabs", "aria-label": "Sections" }, h("div", { class: "in" }, b("diary", "Diary"), b("activity", "Activity"), b("weight", "Weight")));
  }
  async function go(delta) {
    const n = iso(addDays(parse(S.day), delta));
    if (n > today()) return;
    S.day = n; await refresh();
  }
  async function refresh() {
    try { await loadDay(); } catch (e) { toast(errText(e)); }
    renderMain();
  }

  // ================= DIARY =================
  function ringSvg(vals) {
    const rings = [[45, "var(--kcal)", "var(--kcal-track)", vals[0]], [32, "var(--prot)", "var(--prot-track)", vals[1]], [19, "var(--fibre)", "var(--fibre-track)", vals[2]]];
    return `<svg viewBox="0 0 104 104" role="img" aria-label="Calories, protein and fibre progress"><g transform="rotate(-90 52 52)" fill="none" stroke-linecap="round" stroke-width="11">` +
      rings.map(([r, c, tr, p]) => { const C = 2 * Math.PI * r, f = Math.max(0, Math.min(1, p || 0));
        return `<circle cx="52" cy="52" r="${r}" stroke="${tr}"/>` + (f > 0 ? `<circle cx="52" cy="52" r="${r}" stroke="${c}" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - f)).toFixed(1)}"/>` : ""); }).join("") +
      `</g></svg>`;
  }
  function renderDiary(view) {
    const g = goalsFor(S.profile, weightOn(S.day), S.day);
    const tot = k => S.entries.reduce((a, e) => a + n0(e[k]), 0);
    const kin = tot("kcal"), prot = tot("protein"), fib = tot("fibre"), carbs = tot("carbs"), fat = tot("fat"), sugar = tot("sugar"), sodium = tot("sodium_mg");
    const ex = S.workouts.reduce((a, w) => a + n0(w.kcal), 0);
    if (!g) { view.append(h("div", { class: "banner" }, "Finish your Profile to see your goals. ", h("button", { class: "link", text: "Open Profile", onclick: () => profileSheet(true) }))); }
    const budget = g ? g.kcal + ex : 0, left = budget - kin;
    view.append(h("section", { class: "card" },
      h("div", { class: "rings" },
        h("div", { html: ringSvg([budget ? kin / budget : 0, g ? prot / g.protein : 0, g ? fib / g.fibre : 0]) }),
        h("div", { class: "legend" },
          h("div", null, h("div", { class: "k", text: "Calories" }), h("div", { class: "v num", style: "color:var(--kcal)", text: `${fmt(kin)} / ${g ? fmt(budget) : "–"} kcal` })),
          h("div", null, h("div", { class: "k", text: "Protein" }), h("div", { class: "v num", style: "color:var(--prot)", text: `${fmt(prot)} / ${g ? g.protein : "–"} g` })),
          h("div", null, h("div", { class: "k", text: "Fibre" }), h("div", { class: "v num", style: "color:var(--fibre)", text: `${r1(fib)} / ${g ? g.fibre : 30} g` })))),
      g ? h("div", { class: "row budget num" }, h("span", { text: `Goal ${fmt(g.kcal)} + exercise ${fmt(ex)}` }), h("b", { style: `color:${left < 0 ? "var(--err)" : "var(--ink)"}`, text: left < 0 ? `${fmt(-left)} over` : `${fmt(left)} left` })) : null,
      h("div", { class: "chips num" },
        h("span", { class: "chip" }, "Carbs ", h("b", { text: `${fmt(carbs)}${g ? " / " + g.carbs : ""} g` })),
        h("span", { class: "chip" }, "Fat ", h("b", { text: `${fmt(fat)}${g ? " / " + g.fat : ""} g` })),
        h("span", { class: "chip" }, "Sugar ", h("b", { text: `${fmt(sugar)} g` })),
        h("span", { class: "chip" }, "Sodium ", h("b", { text: `${fmt(sodium)} mg` })))));

    MEALS.forEach(([mk, mn]) => {
      const items = S.entries.filter(e => e.meal === mk);
      const yItems = S.yEntries.filter(e => e.meal === mk);
      const card = h("section", { class: "card", "aria-label": mn },
        h("div", { class: "row" }, h("h2", { text: mn }), h("span", { class: "small muted num", text: `${fmt(items.reduce((a, e) => a + n0(e.kcal), 0))} kcal · fibre ${r1(items.reduce((a, e) => a + n0(e.fibre), 0))} g` })));
      items.forEach(e => card.append(h("div", { class: "item" },
        h("div", null, h("div", { class: "nm", text: e.name }),
          h("div", { class: "sub num", text: [e.amount_label, `P ${r1(n0(e.protein))} · C ${r1(n0(e.carbs))} · F ${r1(n0(e.fat))} · Fibre ${e.fibre == null ? "–" : r1(e.fibre)}`].filter(Boolean).join(" · ") })),
        h("div", { class: "kc num" }, fmt(e.kcal), h("small", { text: "kcal" })),
        armDelete(h("button", { class: "del", text: "✕", "aria-label": "Delete " + e.name }), async () => {
          const { error } = await sb.from("diary_entries").delete().eq("id", e.id);
          if (error) return toast(errText(error));
          await refresh();
        }))));
      const acts = h("div", { class: "acts" }, h("button", { class: "pill accent", text: "+ Add food", onclick: () => foodSheet(mk) }));
      if (yItems.length && !items.length) acts.append(h("button", { class: "pill", text: `Copy yesterday (${yItems.length})`, onclick: () => copyItems(yItems) }));
      card.append(acts);
      view.append(card);
    });
  }
  async function copyItems(list) {
    const rows = list.map(({ id, created_at, user_id, ...rest }) => Object.assign(rest, { date: S.day, source: "copy" }));
    const { error } = await sb.from("diary_entries").insert(rows);
    if (error) return toast(errText(error));
    toast(`Added ${rows.length} item${rows.length > 1 ? "s" : ""}`);
    await refresh();
  }

  // ================= sheets =================
  const stack = [];
  function openSheet(build) {
    const el = h("div", { class: "sheet", role: "dialog", "aria-modal": "true" });
    document.body.append(el); stack.push(el);
    document.body.style.overflow = "hidden";
    build(el);
    return el;
  }
  function closeSheet() {
    const el = stack.pop(); if (el) el.remove();
    if (!stack.length) document.body.style.overflow = "";
  }
  function closeAll() { while (stack.length) closeSheet(); }
  function sheetHead(title, { left, right } = {}) {
    return h("div", { class: "sheethead" },
      h("div", { class: "l" }, left ? h("button", { text: left[0], onclick: left[1] }) : null),
      h("h2", { text: title }),
      h("div", { class: "r" }, right ? h("button", { text: right[0], onclick: right[1] }) : null));
  }

  // ================= PROFILE =================
  function profileSheet(forced) {
    const p = Object.assign({}, S.profile || {});
    const t = today();
    const curKg = weightOn(t);
    openSheet(el => {
      const pg = h("div", { class: "page" });
      el.append(pg);
      pg.append(sheetHead("Profile", { left: forced ? null : ["Close", closeSheet] }));
      if (forced) pg.append(h("div", { class: "banner", text: "Fill in your profile first. Your calorie, protein, fat, carb and fibre goals are worked out from it." }));

      const birth = textIn(p.birth_date || "", { type: "date", max: t });
      const height = numIn(p.height_cm, "180", "numeric");
      const weight = numIn(curKg, "85.0");
      const target = numIn(p.target_weight_kg, "80.0");
      const tdate = textIn(p.target_date || "", { type: "date", min: iso(addDays(new Date(), 7)) });
      const steps = numIn(p.step_goal || 10000, "10000", "numeric");
      const msg = h("div", { class: "msg", role: "status" });

      const setMonths = m => { const n = new Date(); tdate.value = iso(new Date(n.getFullYear(), n.getMonth() + m, n.getDate())); update(); };
      const ovIn = {}, OV = [["deficit_override", "Daily deficit", "kcal", "deficit"], ["kcal_override", "Daily calories", "kcal", "kcal"], ["protein_override", "Protein", "g", "protein"], ["fat_override", "Fat", "g", "fat"], ["carbs_override", "Carbs", "g", "carbs"]];
      const sugWrap = h("div", { style: "display:grid;gap:8px" });
      const info = h("div", { class: "small muted" });
      const fibreIn = numIn(p.fibre_g || 30, "30", "numeric");

      function read() {
        p.birth_date = birth.value || null;
        p.height_cm = num(height.value);
        p.target_weight_kg = num(target.value);
        p.target_date = tdate.value || null;
        p.step_goal = Math.round(num(steps.value) || 10000);
        OV.forEach(([k]) => { const v = num(ovIn[k].value); p[k] = v == null ? null : Math.round(v); });
        p.fibre_g = Math.round(num(fibreIn.value) || 30);
      }
      function update() {
        read();
        const kg = num(weight.value);
        const g = goalsFor(p, kg, t);
        info.innerHTML = "";
        if (!g) { info.textContent = "Fill in sex, date of birth, height and current weight to see suggestions."; }
        else {
          info.append(`Age ${g.age} · resting burn ${fmt(g.bmr)} kcal · everyday burn ${fmt(g.tdee)} kcal`);
          if (g.days) info.append(h("br"), `${g.days} days to target`);
          if (g.tooFast) info.append(h("br"), h("b", { style: "color:var(--err)", text: "That pace is faster than 1% of body weight a week, so the deficit is capped. A later date fits it." }));
          if (g.floorHit) info.append(h("br"), h("b", { style: "color:var(--err)", text: `Calories held at the ${fmt(g.floor)} kcal minimum.` }));
        }
        OV.forEach(([k, , unit, sk]) => {
          const sug = g ? g.sug[sk] : null;
          ovIn[k].placeholder = sug == null ? "–" : String(sug);
          ovIn[k].row.querySelector(".hint").textContent = sug == null ? "" : (p[k] != null ? `Set by you · suggested ${fmt(sug)} ${unit}` : `Suggested ${fmt(sug)} ${unit}`);
        });
      }
      OV.forEach(([k, label]) => {
        const inp = numIn(p[k], "", "numeric");
        inp.addEventListener("input", update);
        const reset = h("button", { class: "link tiny", type: "button", text: "Use suggested", onclick: () => { inp.value = ""; update(); } });
        const row = h("div", { class: "goalrow" }, h("div", null, h("div", { text: label }), h("div", { class: "hint" }), reset), inp);
        inp.row = row; ovIn[k] = inp; sugWrap.append(row);
      });
      sugWrap.append(h("div", { class: "goalrow" }, h("div", null, h("div", { text: "Fibre" }), h("div", { class: "hint", text: "Fixed daily goal" })), fibreIn));

      [birth, height, weight, target, tdate, steps, fibreIn].forEach(i => i.addEventListener("input", update));

      pg.append(
        h("section", { class: "card" }, h("h2", { text: "About you" }),
          field("Sex", seg([["male", "Male"], ["female", "Female"]], p.sex || "", v => { p.sex = v; update(); })),
          h("div", { class: "grid2" }, field("Date of birth", birth), field("Height (cm)", height)),
          field("Current weight (kg)", weight),
          field("Daily life, outside workouts", seg(FACTORS.map(([v, l]) => [v, l]), Number(p.activity_factor || 1.3), v => { p.activity_factor = v; update(); })),
          h("div", { class: "tiny muted", text: "Desk job ×1.2 · Light ×1.3 · On my feet ×1.4. Workouts are added separately." })),
        h("section", { class: "card" }, h("h2", { text: "Goal" }),
          h("div", { class: "grid2" }, field("Target weight (kg)", target), field("Target date", tdate)),
          h("div", { class: "row wrap", style: "justify-content:flex-start;gap:6px" },
            ...[1, 2, 3, 6, 12].map(m => h("button", { class: "pill", type: "button", text: `in ${m} mo`, onclick: () => setMonths(m) })))),
        h("section", { class: "card" }, h("h2", { text: "Daily goals" }), info,
          h("div", { class: "tiny muted", text: "Leave a box empty to use the suggestion. Type a number to set your own." }), sugWrap),
        h("section", { class: "card" }, h("h2", { text: "Activity" }), field("Daily step goal", steps)),
        msg);

      const save = h("button", { class: "btn", type: "button", text: "Save profile" });
      save.addEventListener("click", async () => {
        read();
        const kg = num(weight.value);
        const problems = [];
        if (!p.sex) problems.push("sex");
        if (!p.birth_date) problems.push("date of birth");
        if (!p.height_cm || p.height_cm < 120 || p.height_cm > 230) problems.push("height (120–230 cm)");
        if (!kg || kg < 30 || kg > 300) problems.push("current weight (30–300 kg)");
        if ((p.target_weight_kg && !p.target_date) || (!p.target_weight_kg && p.target_date)) problems.push("both target weight and target date, or neither");
        if (problems.length) { msg.className = "msg err"; msg.textContent = "Check: " + problems.join(", ") + "."; return; }
        save.disabled = true; msg.className = "msg"; msg.textContent = "Saving…";
        try {
          const row = {
            sex: p.sex, birth_date: p.birth_date, height_cm: p.height_cm, activity_factor: p.activity_factor || 1.3,
            target_weight_kg: p.target_weight_kg, target_date: p.target_date, step_goal: p.step_goal, fibre_g: p.fibre_g,
            deficit_override: p.deficit_override, kcal_override: p.kcal_override, protein_override: p.protein_override,
            fat_override: p.fat_override, carbs_override: p.carbs_override, completed: true, updated_at: new Date().toISOString()
          };
          if (!S.profile.start_weight_kg) row.start_weight_kg = kg;
          const { error } = await sb.from("profiles").update(row).eq("user_id", S.user.id);
          if (error) throw error;
          if (curKg == null || Math.abs(kg - curKg) > 0.001) {
            const { error: we } = await sb.from("weights").upsert({ user_id: S.user.id, date: t, kg }, { onConflict: "user_id,date" });
            if (we) throw we;
          }
          await loadProfile();
          const g = goalsFor(S.profile, weightOn(t), t);
          if (g) await sb.from("goal_history").insert({ date: t, kcal: g.kcal, protein: g.protein, fat: g.fat, carbs: g.carbs, fibre: g.fibre, reason: "Profile saved" });
          closeAll(); toast("Profile saved"); await refresh();
        } catch (e) { msg.className = "msg err"; msg.textContent = errText(e); save.disabled = false; }
      });
      pg.append(save);
      pg.append(h("div", { class: "row", style: "justify-content:center" },
        h("span", { class: "small muted", text: `Signed in as ${S.profile && S.profile.username || S.user.email}` })),
        h("button", { class: "btn ghost", type: "button", text: "Sign out", onclick: async () => { closeAll(); await sb.auth.signOut(); } }));
      update();
    });
  }

  // ================= FOOD SEARCH =================
  const offFields = "code,product_name,product_name_en,brands,nutriments,serving_size,serving_quantity,quantity,product_quantity,product_quantity_unit";
  const LIQUID_RE = /\d\s*(ml|cl|dl|l|litre|liter)\b/i;
  const USDA_LIQUID_RE = /\b(milk|juice|beverage|drink|water|soda|cola|wine|beer|coffee|tea|smoothie|kefir|nectar|lemonade|broth)\b/i;
  const U = f => (f && f.unit === "ml") ? "ml" : "g";
  function fromOff(p) {
    if (!p) return null;
    const n = p.nutriments || {};
    let kcal = n["energy-kcal_100g"];
    if (kcal == null && n.energy_100g != null) kcal = n.energy_100g / 4.184;
    const name = (p.product_name_en || p.product_name || "").trim();
    if (!name || kcal == null) return null;
    const liquid = /^(ml|cl|dl|l)$/i.test(String(p.product_quantity_unit || "")) || LIQUID_RE.test(p.quantity || "") || LIQUID_RE.test(p.serving_size || "");
    return { source: "off", source_id: String(p.code), barcode: String(p.code), name, brand: (Array.isArray(p.brands) ? p.brands[0] || "" : String(p.brands || "").split(",")[0]).trim() || null,
      unit: liquid ? "ml" : "g", pack_g: num(p.product_quantity) || null, pack_name: p.quantity || null,
      serving_name: p.serving_size || null, serving_g: num(p.serving_quantity),
      kcal: num(kcal), protein: num(n.proteins_100g), carbs: num(n.carbohydrates_100g), fat: num(n.fat_100g),
      fibre: num(n.fiber_100g), sugar: num(n.sugars_100g), sat_fat: num(n["saturated-fat_100g"]),
      sodium_mg: n.sodium_100g != null ? num(n.sodium_100g) * 1000 : null };
  }
  async function searchOff(q, signal) {
    // Name search goes through the "off-search" Edge Function (Open Food Facts blocks direct browser search).
    const { data, error } = await sb.functions.invoke("off-search", { body: { q } });
    if (signal && signal.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
    if (error || !data || data.error) throw new Error("Open Food Facts didn't answer");
    return (data.products || []).map(fromOff).filter(Boolean);
  }
  async function offBarcode(code) {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${offFields}`);
    if (!r.ok) return null;
    const j = await r.json();
    return j.status === 1 ? fromOff(Object.assign({ code }, j.product)) : null;
  }
  async function searchUsda(q, signal) {
    const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${CFG.usdaKey}&query=${encodeURIComponent(q)}&pageSize=20&dataType=Foundation,SR%20Legacy`;
    const r = await fetch(url, { signal }); if (!r.ok) throw new Error("USDA didn't answer");
    const j = await r.json();
    return (j.foods || []).map(f => {
      const v = no => { const x = (f.foodNutrients || []).find(n => String(n.nutrientNumber) === no); return x ? num(x.value) : null; };
      const kcal = v("208") ?? v("957") ?? v("958");
      if (kcal == null) return null;
      const name = f.description.charAt(0) + f.description.slice(1).toLowerCase();
      const liquid = USDA_LIQUID_RE.test(f.description) && !/\b(powder|dry|dried|instant)\b/i.test(f.description);
      return { source: "usda", source_id: String(f.fdcId), barcode: null, name, brand: null, serving_name: null, serving_g: null, unit: liquid ? "ml" : "g", pack_g: null, pack_name: null,
        kcal, protein: v("203"), carbs: v("205"), fat: v("204"), fibre: v("291"), sugar: v("269"), sat_fat: v("606"), sodium_mg: v("307") };
    }).filter(Boolean);
  }
  const per = (f, g) => ({ kcal: n0(f.kcal) * g / 100, protein: n0(f.protein) * g / 100, carbs: n0(f.carbs) * g / 100, fat: n0(f.fat) * g / 100,
    fibre: f.fibre == null ? null : f.fibre * g / 100, sugar: f.sugar == null ? null : f.sugar * g / 100,
    sat_fat: f.sat_fat == null ? null : f.sat_fat * g / 100, sodium_mg: f.sodium_mg == null ? null : f.sodium_mg * g / 100 });
  const SRC = { off: "Open Food Facts", usda: "USDA", mine: "My food", mfp: "MyFitnessPal" };

  // pick: when set, the sheet chooses an ingredient for a meal instead of logging to the diary.
  function foodSheet(meal, pick) {
    let q = "", ctrl = null, timer = null, filter = "all", mealsP = null, tok = 0;
    const getMeals = () => mealsP || (mealsP = loadMeals().catch(() => []));
    const saved = m => { mealsP = null; draw(); if (m) mealLogSheet(m, meal, saved); };
    openSheet(el => {
      const pg = h("div", { class: "page" }); el.append(pg);
      const title = h("h2", { text: pick ? "Add ingredient" : `Add to ${MEAL[meal]}` });
      const head = sheetHead("", { left: [pick ? "‹ Back" : "Close", closeSheet] }); head.children[1].replaceWith(title);
      const search = textIn("", { type: "search", placeholder: "Search foods", enterkeyhint: "search", "aria-label": "Search foods" });
      const results = h("div", { style: "display:grid;gap:10px" });
      const filters = [["all", "All"], ["recent", "Recent"], ["mine", "My foods"]];
      if (!pick) filters.push(["meals", "My meals"]);
      pg.append(head,
        pick ? null : seg(MEALS, meal, v => { meal = v; title.textContent = `Add to ${MEAL[v]}`; }),
        h("div", { class: "searchrow" }, search, h("button", { class: "scanbtn", "aria-label": "Scan a barcode", html: ICON.scan, onclick: () => scanSheet(meal, pick) })),
        h("div", { class: "row", style: "justify-content:flex-start;gap:8px" },
          pick ? null : h("button", { class: "pill", text: "Quick add", onclick: () => quickAddSheet(meal) }),
          h("button", { class: "pill", text: "Create food", onclick: () => createFoodSheet(meal, null, pick) }),
          pick ? null : h("button", { class: "pill", text: "Create meal", onclick: () => mealBuilderSheet(null, saved) })),
        seg(filters, "all", v => { filter = v; draw(); }),
        results);

      const mealRow = m => { const mi = mealInfo(m);
        return h("button", { type: "button", onclick: () => mealLogSheet(m, meal, saved) },
          h("div", null, h("div", { class: "nm", text: m.name }),
            h("div", { class: "sub", text: [`per portion (${mi.portions} in total)`, `${m.ings.length} ingredient${m.ings.length === 1 ? "" : "s"}`, mi.tot.fibre == null ? "fibre not listed" : `fibre ${r1(mi.tot.fibre / mi.portions)} g`].join(" · ") })),
          h("div", { class: "kc num" }, fmt(mi.tot.kcal / mi.portions), h("small", { text: "kcal" }))); };
      const mealBlock = (label, list, note) => {
        const b = h("div", { class: "res" }, h("div", { class: "lbl", text: label }));
        if (note) b.append(h("div", { class: "empty", style: "padding:6px 0 12px", text: note }));
        list.forEach(m => b.append(mealRow(m)));
        return b;
      };

      const row = f => h("button", { type: "button", onclick: () => amountSheet(f, meal, pick) },
        h("div", null, h("div", { class: "nm", text: f.name }),
          h("div", { class: "sub", text: [f.brand, SRC[f.source], `per 100 ${U(f)}`, f.fibre == null ? "fibre not listed" : `fibre ${r1(f.fibre)} g`].filter(Boolean).join(" · ") })),
        h("div", { class: "kc num" }, fmt(f.kcal), h("small", { text: "kcal" })));
      const block = (label, list, note) => {
        const b = h("div", { class: "res" }, h("div", { class: "lbl", text: label }));
        if (note) b.append(h("div", { class: "empty", style: "padding:6px 0 12px", text: note }));
        list.forEach(f => b.append(row(f)));
        return b;
      };

      async function draw() {
        clearTimeout(timer); if (ctrl) ctrl.abort();
        const my = ++tok;
        results.innerHTML = "";
        const term = q.trim(), lt = term.toLowerCase();
        const matchMeals = async () => (await getMeals()).filter(m => !lt || m.name.toLowerCase().includes(lt));
        if (filter === "meals") {
          const ms = await matchMeals(); if (my !== tok) return;
          results.append(mealBlock("My meals", ms, ms.length ? null : (lt ? "No meals match." : "Build a meal from its ingredients once, then log it in one tap. Tap Create meal.")));
          return;
        }
        let local = sb.from("foods").select("*");
        if (filter === "mine") local = local.eq("source", "mine");
        if (term) local = local.ilike("name", `%${term.replace(/[%_]/g, "")}%`);
        local = local.order("last_used", { ascending: false, nullsFirst: false }).limit(30);
        const [{ data: mine }, ms] = await Promise.all([local, !pick && filter === "all" ? matchMeals() : []]);
        if (my !== tok) return;
        if (ms.length) results.append(mealBlock("My meals", term ? ms : ms.slice(0, 5)));
        if (!term) {
          results.append(block(filter === "mine" ? "My foods" : "Recent", mine || [], (mine || []).length ? null : (filter === "mine" ? "Foods you create appear here." : "Foods you log appear here for one-tap adding.")));
          results.append(h("div", { class: "small muted", style: "text-align:center", text: "Calories shown per 100 g, or per 100 ml for drinks." }));
          return;
        }
        if ((mine || []).length) results.append(block("Your foods", mine));
        if (filter !== "all") return;
        const offB = block("Open Food Facts", [], "Searching…"), usdaB = block("USDA", [], "Searching…");
        results.append(offB, usdaB);
        ctrl = new AbortController(); const sig = ctrl.signal;
        timer = setTimeout(() => {
          searchOff(term, sig).then(l => { offB.replaceWith(block("Open Food Facts", l, l.length ? null : "No matches.")); })
            .catch(e => { if (e.name !== "AbortError") offB.replaceWith(block("Open Food Facts", [], "Couldn't reach Open Food Facts. Try again.")); });
          searchUsda(term, sig).then(l => { usdaB.replaceWith(block("USDA", l, l.length ? null : "No matches.")); })
            .catch(e => { if (e.name !== "AbortError") usdaB.replaceWith(block("USDA", [], "Couldn't reach USDA. Try again.")); });
        }, 350);
      }
      search.addEventListener("input", () => { q = search.value; clearTimeout(draw.t); draw.t = setTimeout(draw, 250); });
      draw();
    });
  }

  async function enrichOff(f) {
    // Search results don't always carry the pack size; the barcode endpoint does (and allows browser calls).
    if (f.source !== "off" || !f.barcode || f.pack_g != null) return f;
    try {
      const full = await offBarcode(f.barcode);
      if (!full) return f;
      const merged = Object.assign({}, f, { unit: full.unit, pack_g: full.pack_g, pack_name: full.pack_name, serving_g: f.serving_g || full.serving_g, serving_name: f.serving_name || full.serving_name });
      if (f.id) await sb.from("foods").update({ unit: merged.unit, pack_g: merged.pack_g, pack_name: merged.pack_name }).eq("id", f.id);
      return merged;
    } catch (_) { return f; }
  }

  // Saves a database food into your foods table (or touches last_used) and returns its id.
  async function ensureFood(f) {
    const now = new Date().toISOString();
    if (f.id) { await sb.from("foods").update({ last_used: now }).eq("id", f.id); return f.id; }
    const { id, created_at, ...row } = f;
    const { data, error } = await sb.from("foods").upsert(Object.assign(row, { user_id: S.user.id, last_used: now }), { onConflict: "user_id,source,source_id" }).select("id").single();
    if (error) throw error;
    return data.id;
  }
  const rnd = n => ({ kcal: r1(n.kcal), protein: r1(n.protein), carbs: r1(n.carbs), fat: r1(n.fat), fibre: n.fibre == null ? null : r1(n.fibre),
    sugar: n.sugar == null ? null : r1(n.sugar), sat_fat: n.sat_fat == null ? null : r1(n.sat_fat), sodium_mg: n.sodium_mg == null ? null : Math.round(n.sodium_mg) });
  const nGrid = n => h("div", { class: "ngrid num" }, ...[["kcal", fmt(n.kcal), "kcal", "var(--kcal)"], ["Protein", r1(n.protein), "g", "var(--prot)"], ["Carbs", r1(n.carbs), "g"], ["Fat", r1(n.fat), "g"], ["Fibre", n.fibre == null ? "–" : r1(n.fibre), n.fibre == null ? "" : "g", "var(--fibre)"]]
    .map(([k, v, u, c]) => h("div", null, h("span", { class: "v", style: c ? `color:${c}` : "" }, v, u ? h("small", { text: u }) : null), h("span", { class: "k", text: k }))));

  async function amountSheet(f0, meal, pick) {
    const f = await enrichOff(f0);
    const base = U(f);
    const hasServing = f.serving_g && f.serving_g > 0;
    const hasPack = f.pack_g && f.pack_g > 0;
    // Meal ingredients default to weight; diary logging defaults to a serving.
    let unit = hasServing && !pick ? "serving" : "base";
    openSheet(el => {
      const pg = h("div", { class: "page" }); el.append(pg);
      pg.append(sheetHead("Amount", { left: ["‹ Back", closeSheet] }));
      const qIn = numIn(unit === "serving" ? 1 : 100, "", "decimal"); qIn.setAttribute("aria-label", "Amount");
      const uLbl = h("span", { class: "u" });
      const grid = h("div"), extra = h("div", { class: "small muted num" });
      const size = () => unit === "serving" ? f.serving_g : unit === "pack" ? f.pack_g : 1;
      const grams = () => (num(qIn.value) || 0) * size();
      const unitText = () => unit === "serving" ? "serving" : unit === "pack" ? "pack" : base;
      const draw = () => {
        const n = per(f, grams());
        uLbl.textContent = unitText();
        grid.innerHTML = "";
        grid.append(nGrid(n));
        extra.textContent = [`${r1(grams())} ${base}`, n.sugar != null ? `sugar ${r1(n.sugar)} g` : null, n.sat_fat != null ? `sat fat ${r1(n.sat_fat)} g` : null, n.sodium_mg != null ? `sodium ${fmt(n.sodium_mg)} mg` : null].filter(Boolean).join(" · ");
      };
      qIn.addEventListener("input", draw);
      const step = d => { const v = Math.max(0, r1((num(qIn.value) || 0) + d)); qIn.value = v; draw(); };
      const stepSize = () => unit === "base" ? 10 : unit === "pack" ? 0.25 : 0.5;
      const units = [];
      if (hasServing) units.push(["serving", `Serving (${r1(f.serving_g)} ${base})`]);
      if (hasPack) units.push(["pack", `Pack (${r1(f.pack_g)} ${base})`]);
      units.push(["base", base === "ml" ? "Millilitres" : "Grams"]);
      const unitSeg = units.length > 1 ? seg(units, unit, v => { const g = grams(); unit = v; qIn.value = r1(g / size()); draw(); }) : null;
      const msg = h("div", { class: "msg", role: "status" });
      const add = h("button", { class: "btn", type: "button", text: pick ? "Add to meal" : "Add to diary" });
      add.addEventListener("click", async () => {
        const g = grams();
        if (!(g > 0)) { msg.className = "msg err"; msg.textContent = "Enter an amount."; return; }
        add.disabled = true;
        try {
          const foodId = await ensureFood(f);
          if (pick) { pick(Object.assign({}, f, { id: foodId }), r1(g)); return; }
          const n = per(f, g);
          const q = r1(num(qIn.value));
          const label = unit === "serving" ? `${q} × ${f.serving_name || "serving"} (${r1(g)} ${base})`
            : unit === "pack" ? `${q} × pack${f.pack_name ? " " + f.pack_name : ""} (${r1(g)} ${base})` : `${r1(g)} ${base}`;
          const { error } = await sb.from("diary_entries").insert(Object.assign({ date: S.day, meal, food_id: foodId, name: f.brand ? `${f.name} (${f.brand})` : f.name, amount_label: label, grams: r1(g), source: f.source }, rnd(n)));
          if (error) throw error;
          closeAll(); toast(`Added to ${MEAL[meal].toLowerCase()}`); await refresh();
        } catch (e) { msg.className = "msg err"; msg.textContent = errText(e); add.disabled = false; }
      });
      pg.append(
        h("section", { class: "card" },
          h("div", null, h("h2", { text: f.name }), h("div", { class: "small muted", text: [f.brand, SRC[f.source], f.fibre == null ? "fibre not listed by this source" : null].filter(Boolean).join(" · ") })),
          unitSeg,
          h("div", { class: "stepper" }, h("button", { type: "button", text: "−", "aria-label": "Less", onclick: () => step(-stepSize()) }), h("div", { class: "unitwrap" }, qIn, uLbl),
            h("button", { type: "button", text: "+", "aria-label": "More", onclick: () => step(stepSize()) })),
          grid, extra),
        pick ? null : h("section", { class: "card" }, field("Meal", seg(MEALS, meal, v => { meal = v; }))),
        msg, add);
      draw();
    });
  }

  function quickAddSheet(meal) {
    openSheet(el => {
      const pg = h("div", { class: "page" }); el.append(pg);
      const name = textIn("", { placeholder: "Coffee and pastry", maxlength: "80" });
      const k = numIn("", "350", "numeric"), p = numIn("", "0"), c = numIn("", "0"), f = numIn("", "0"), fi = numIn("", "0");
      const msg = h("div", { class: "msg", role: "status" });
      const add = h("button", { class: "btn", type: "button", text: "Add to diary" });
      add.addEventListener("click", async () => {
        const kcal = num(k.value);
        if (kcal == null || kcal < 0) { msg.className = "msg err"; msg.textContent = "Enter the calories."; return; }
        add.disabled = true;
        const { error } = await sb.from("diary_entries").insert({ date: S.day, meal, name: name.value.trim() || "Quick add", amount_label: "quick add",
          kcal: Math.round(kcal), protein: num(p.value) || 0, carbs: num(c.value) || 0, fat: num(f.value) || 0, fibre: num(fi.value), source: "quick" });
        if (error) { msg.className = "msg err"; msg.textContent = errText(error); add.disabled = false; return; }
        closeAll(); toast("Added"); await refresh();
      });
      pg.append(sheetHead("Quick add", { left: ["‹ Back", closeSheet] }),
        h("section", { class: "card" }, field("Meal", seg(MEALS, meal, v => meal = v)), field("Name (optional)", name),
          h("div", { class: "grid2" }, field("Calories (kcal)", k), field("Protein (g)", p)),
          h("div", { class: "grid3" }, field("Carbs (g)", c), field("Fat (g)", f), field("Fibre (g)", fi))),
        msg, add);
    });
  }

  function createFoodSheet(meal, barcode, pick) {
    let basis = "serving", fu = "g";
    openSheet(el => {
      const pg = h("div", { class: "page" }); el.append(pg);
      const name = textIn("", { placeholder: "Halloumi", maxlength: "80" });
      const brand = textIn("", { placeholder: "optional", maxlength: "60" });
      const sname = textIn("", { placeholder: "1 slice", maxlength: "40" });
      const sg = numIn("", "30");
      const pk = numIn("", "optional");
      const bc = textIn(barcode || "", { inputmode: "numeric", placeholder: "optional" });
      const inp = { kcal: numIn("", "0", "numeric"), protein: numIn("", "0"), carbs: numIn("", "0"), fat: numIn("", "0"), fibre: numIn("", "0"), sugar: numIn("", "optional"), sat_fat: numIn("", "optional"), sodium_mg: numIn("", "optional", "numeric") };
      const msg = h("div", { class: "msg", role: "status" });
      const save = h("button", { class: "btn", type: "button", text: "Save food" });
      save.addEventListener("click", async () => {
        const g = num(sg.value);
        if (!name.value.trim()) { msg.className = "msg err"; msg.textContent = "Give the food a name."; return; }
        if (basis === "serving" && !(g > 0)) { msg.className = "msg err"; msg.textContent = `Enter the serving size in ${fu} (it's on the label).`; return; }
        if (num(inp.kcal.value) == null) { msg.className = "msg err"; msg.textContent = "Enter the calories."; return; }
        const factor = basis === "serving" ? 100 / g : 1;
        const val = k => { const v = num(inp[k].value); return v == null ? null : Math.round(v * factor * 100) / 100; };
        const row = { user_id: S.user.id, source: "mine", source_id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())), barcode: bc.value.trim() || null,
          name: name.value.trim(), brand: brand.value.trim() || null, serving_name: sname.value.trim() || (g ? `${r1(g)} ${fu}` : null), serving_g: g || null,
          unit: fu, pack_g: num(pk.value) || null, pack_name: num(pk.value) ? `${r1(num(pk.value))} ${fu}` : null,
          kcal: val("kcal"), protein: val("protein") || 0, carbs: val("carbs") || 0, fat: val("fat") || 0, fibre: val("fibre"), sugar: val("sugar"), sat_fat: val("sat_fat"), sodium_mg: val("sodium_mg") };
        save.disabled = true;
        const { data, error } = await sb.from("foods").insert(row).select("*").single();
        if (error) { msg.className = "msg err"; msg.textContent = errText(error); save.disabled = false; return; }
        closeSheet(); toast("Saved to My foods"); amountSheet(data, meal, pick);
      });
      pg.append(sheetHead("Create food", { left: ["‹ Back", closeSheet] }),
        h("section", { class: "card" }, field("Name", name), field("Brand", brand),
          field("Measured in", seg([["g", "Grams (food)"], ["ml", "Millilitres (drink)"]], fu, v => fu = v)),
          h("div", { class: "grid2" }, field("Serving name", sname), field("Serving size (g or ml)", sg)),
          h("div", { class: "grid2" }, field("Pack size (g or ml)", pk), field("Barcode", bc))),
        h("section", { class: "card" }, h("h2", { text: "Nutrition from the label" }),
          seg([["serving", "Per serving"], ["100", "Per 100 g / ml"]], basis, v => basis = v),
          h("div", { class: "grid2" }, field("Calories (kcal)", inp.kcal), field("Protein (g)", inp.protein)),
          h("div", { class: "grid3" }, field("Carbs (g)", inp.carbs), field("Fat (g)", inp.fat), field("Fibre (g)", inp.fibre)),
          h("div", { class: "grid3" }, field("Sugar (g)", inp.sugar), field("Sat. fat (g)", inp.sat_fat), field("Sodium (mg)", inp.sodium_mg))),
        msg, save);
    });
  }

  // ================= MY MEALS =================
  // A meal is a recipe: ingredients (foods) with grams, split into portions.
  // total_g (optional) is the cooked weight, so a meal can also be logged by weight.
  const NK = ["kcal", "protein", "carbs", "fat", "fibre", "sugar", "sat_fat", "sodium_mg"];
  async function loadMeals() {
    const { data, error } = await sb.from("meals").select("id,name,total_g,portions,created_at,meal_ingredients(id,grams,food:foods(*))").order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(m => Object.assign(m, { ings: (m.meal_ingredients || []).filter(i => i.food).map(i => ({ food: i.food, grams: Number(i.grams) })) }));
  }
  function mealInfo(m) {
    const portions = Number(m.portions) > 0 ? Number(m.portions) : 1;
    const tot = {}, known = {};
    NK.forEach(k => { tot[k] = 0; known[k] = 0; });
    let weight = 0, fibreMissing = 0;
    m.ings.forEach(i => {
      const n = per(i.food, n0(i.grams));
      NK.forEach(k => { if (n[k] != null) { tot[k] += n[k]; known[k]++; } });
      if (i.food.fibre == null) fibreMissing++;
      weight += n0(i.grams);
    });
    NK.forEach(k => { if (m.ings.length && !known[k]) tot[k] = null; });
    return { portions, tot, weight, fibreMissing, scaled: f => Object.fromEntries(NK.map(k => [k, tot[k] == null ? null : tot[k] * f])) };
  }

  function mealLogSheet(m, meal, onChange) {
    const mi = mealInfo(m);
    const cooked = Number(m.total_g) > 0 ? Number(m.total_g) : null;
    let unit = "portion";
    openSheet(el => {
      const pg = h("div", { class: "page" }); el.append(pg);
      pg.append(sheetHead("My meal", { left: ["‹ Back", closeSheet], right: ["Edit", () => mealBuilderSheet(m, m2 => { closeSheet(); onChange(m2); })] }));
      const qIn = numIn(1, "", "decimal"); qIn.setAttribute("aria-label", "Amount");
      const uLbl = h("span", { class: "u" });
      const grid = h("div"), extra = h("div", { class: "small muted num" });
      const frac = () => { const q = num(qIn.value) || 0; return unit === "portion" ? q / mi.portions : q / cooked; };
      const draw = () => {
        uLbl.textContent = unit === "portion" ? "portion" : "g";
        grid.innerHTML = ""; grid.append(nGrid(mi.scaled(frac())));
        extra.textContent = unit === "portion" ? `The whole meal makes ${mi.portions} portion${mi.portions === 1 ? "" : "s"}${cooked ? ` · ${r1(frac() * cooked)} g cooked` : ""}` : `${r1(frac() * mi.portions)} of ${mi.portions} portions`;
      };
      qIn.addEventListener("input", draw);
      const step = d => { qIn.value = Math.max(0, r1((num(qIn.value) || 0) + d)); draw(); };
      const unitSeg = cooked ? seg([["portion", "Portions"], ["g", "Grams (cooked)"]], unit, v => { const f = frac(); unit = v; qIn.value = r1(v === "portion" ? f * mi.portions : f * cooked); draw(); }) : null;
      const ingCard = h("section", { class: "card" }, h("h3", { text: "Ingredients (whole meal)" }));
      m.ings.forEach(i => ingCard.append(h("div", { class: "row small", style: "border-top:1px solid var(--line);padding-top:6px" },
        h("span", { class: "nm", text: i.food.name }), h("span", { class: "muted num", style: "white-space:nowrap", text: `${r1(i.grams)} ${U(i.food)} · ${fmt(per(i.food, i.grams).kcal)} kcal` }))));
      const msg = h("div", { class: "msg", role: "status" });
      const add = h("button", { class: "btn", type: "button", text: "Add to diary" });
      add.addEventListener("click", async () => {
        const f = frac(), q = r1(num(qIn.value) || 0);
        if (!(f > 0)) { msg.className = "msg err"; msg.textContent = "Enter an amount."; return; }
        add.disabled = true;
        const label = unit === "g" ? `${q} g` : `${q} portion${q === 1 ? "" : "s"}${mi.portions !== 1 ? ` of ${mi.portions}` : ""}`;
        const { error } = await sb.from("diary_entries").insert(Object.assign({ date: S.day, meal, meal_id: m.id, name: m.name, amount_label: label,
          grams: cooked ? r1(f * cooked) : null, source: "meal" }, rnd(mi.scaled(f))));
        if (error) { msg.className = "msg err"; msg.textContent = errText(error); add.disabled = false; return; }
        closeAll(); toast(`Added to ${MEAL[meal].toLowerCase()}`); await refresh();
      });
      pg.append(
        h("section", { class: "card" },
          h("div", null, h("h2", { text: m.name }), mi.fibreMissing ? h("div", { class: "small muted", text: `Fibre not listed for ${mi.fibreMissing} ingredient${mi.fibreMissing === 1 ? "" : "s"}` }) : null),
          unitSeg,
          h("div", { class: "stepper" }, h("button", { type: "button", text: "−", "aria-label": "Less", onclick: () => step(unit === "g" ? -10 : -0.5) }),
            h("div", { class: "unitwrap wide" }, qIn, uLbl),
            h("button", { type: "button", text: "+", "aria-label": "More", onclick: () => step(unit === "g" ? 10 : 0.5) })),
          grid, extra),
        h("section", { class: "card" }, field("Meal", seg(MEALS, meal, v => { meal = v; }))),
        msg, add, ingCard);
      draw();
    });
  }

  // onSaved(meal) after save, onSaved(null) after delete. The builder closes itself first.
  function mealBuilderSheet(m, onSaved) {
    const ings = m ? m.ings.map(i => ({ food: i.food, grams: i.grams })) : [];
    openSheet(el => {
      const depth = stack.length;
      const pg = h("div", { class: "page" }); el.append(pg);
      const name = textIn(m ? m.name : "", { placeholder: "Overnight oats", maxlength: "80" });
      const portions = numIn(m ? r1(Number(m.portions) || 1) : 1, "1");
      const cooked = numIn(m && m.total_g ? r1(Number(m.total_g)) : "", "optional");
      const list = h("div", { style: "display:grid" }), sum = h("div", { style: "display:grid;gap:8px" });
      const msg = h("div", { class: "msg", role: "status" });
      const err = t => { msg.className = "msg err"; msg.textContent = t; };

      function drawSum() {
        const mi = mealInfo({ ings, portions: num(portions.value) });
        sum.innerHTML = "";
        sum.append(h("div", { class: "row wrap" }, h("h3", { text: "Per portion" }), h("span", { class: "small muted num", text: `Whole meal ${fmt(mi.tot.kcal)} kcal · ${fmt(mi.weight)} g raw` })),
          nGrid(mi.scaled(1 / mi.portions)));
        if (mi.fibreMissing) sum.append(h("div", { class: "small muted", text: `Fibre isn't listed for ${mi.fibreMissing} ingredient${mi.fibreMissing === 1 ? "" : "s"}, so the real fibre is higher.` }));
      }
      function drawList() {
        list.innerHTML = "";
        if (!ings.length) list.append(h("div", { class: "empty", style: "padding:4px 0", text: "No ingredients yet. Add each one with its weight." }));
        ings.forEach((i, idx) => {
          const sub = h("div", { class: "sub num" });
          const setSub = () => { const n = per(i.food, n0(i.grams)); sub.textContent = `${fmt(n.kcal)} kcal · P ${r1(n.protein)} · Fibre ${n.fibre == null ? "–" : r1(n.fibre)}`; };
          const g = numIn(r1(i.grams), "0"); g.setAttribute("aria-label", `Amount of ${i.food.name}`);
          g.addEventListener("input", () => { i.grams = num(g.value) || 0; setSub(); drawSum(); });
          setSub();
          list.append(h("div", { class: "item ing" },
            h("div", null, h("div", { class: "nm", text: i.food.name }), sub),
            h("div", { class: "unitwrap" }, g, h("span", { class: "u", text: U(i.food) })),
            h("button", { class: "del", type: "button", text: "✕", "aria-label": "Remove " + i.food.name, onclick: () => { ings.splice(idx, 1); drawList(); } })));
        });
        drawSum();
      }
      portions.addEventListener("input", drawSum);

      const addIng = h("button", { class: "pill accent", type: "button", text: "+ Add ingredient", onclick: () => foodSheet(null, (food, grams) => {
        ings.push({ food, grams });
        while (stack.length > depth) closeSheet();
        drawList(); toast(`Added ${food.name}`);
      }) });

      const save = h("button", { class: "btn", type: "button", text: "Save meal" });
      save.addEventListener("click", async () => {
        const nm = name.value.trim(), p = num(portions.value), cg = num(cooked.value);
        const keep = ings.filter(i => i.grams > 0);
        if (!nm) return err("Give the meal a name.");
        if (!keep.length) return err("Add at least one ingredient with its weight.");
        if (!(p > 0)) return err("Enter how many portions it makes.");
        save.disabled = true;
        try {
          const row = { name: nm, portions: p, total_g: cg > 0 ? cg : null };
          let id = m && m.id, r;
          if (id) {
            r = await sb.from("meals").update(row).eq("id", id); if (r.error) throw r.error;
            r = await sb.from("meal_ingredients").delete().eq("meal_id", id); if (r.error) throw r.error;
          } else {
            r = await sb.from("meals").insert(row).select("id").single(); if (r.error) throw r.error;
            id = r.data.id;
          }
          r = await sb.from("meal_ingredients").insert(keep.map(i => ({ meal_id: id, food_id: i.food.id, grams: r1(i.grams) })));
          if (r.error) throw r.error;
          closeSheet(); toast("Meal saved");
          onSaved(Object.assign({ id }, row, { ings: keep }));
        } catch (e) { err(errText(e)); save.disabled = false; }
      });

      let delArmed = false;
      const del = m ? h("button", { class: "btn ghost", type: "button", style: "color:var(--err)", text: "Delete meal" }) : null;
      if (del) del.addEventListener("click", async () => {
        if (!delArmed) { delArmed = true; del.textContent = "Tap again to delete"; setTimeout(() => { delArmed = false; if (del.isConnected) del.textContent = "Delete meal"; }, 3000); return; }
        del.disabled = true;
        const { error } = await sb.from("meals").delete().eq("id", m.id);
        if (error) { err(errText(error)); del.disabled = false; return; }
        closeSheet(); toast("Meal deleted"); onSaved(null);
      });

      pg.append(sheetHead(m ? "Edit meal" : "Create meal", { left: ["Cancel", closeSheet] }),
        h("section", { class: "card" }, field("Name", name),
          h("div", { class: "grid2" }, field("Portions it makes", portions), field("Cooked weight (g)", cooked)),
          h("div", { class: "tiny muted", text: "Cooked weight is optional. Weigh the finished dish and you can log it by grams too." })),
        h("section", { class: "card" }, h("h2", { text: "Ingredients" }), list, h("div", { class: "acts" }, addIng)),
        h("section", { class: "card" }, sum),
        msg, save, del);
      drawList();
    });
  }

  // ================= BARCODE =================
  function loadScript(src) {
    return new Promise((res, rej) => { if (document.querySelector(`script[src="${src}"]`)) return res(); const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.append(s); });
  }
  function scanSheet(meal, pick) {
    let stopFn = null, done = false;
    openSheet(async el => {
      const pg = h("div", { class: "page" }); el.append(pg);
      const close = () => { if (stopFn) stopFn(); closeSheet(); };
      const video = h("video", { class: "video", playsinline: true, muted: true, autoplay: true });
      const msg = h("div", { class: "msg", role: "status", text: "Starting the camera…" });
      const manual = textIn("", { inputmode: "numeric", placeholder: "Or type the barcode number" });
      pg.append(sheetHead("Scan barcode", { left: ["‹ Back", close] }), video, msg,
        h("div", { class: "searchrow" }, manual, h("button", { class: "scanbtn", "aria-label": "Look up barcode", text: "→", onclick: () => found(manual.value.trim()) })));

      async function found(code) {
        if (!code || done) return; done = true;
        if (stopFn) stopFn();
        msg.textContent = `Looking up ${code}…`;
        try {
          const { data: mine } = await sb.from("foods").select("*").eq("barcode", code).limit(1);
          let f = mine && mine[0];
          if (!f) f = await offBarcode(code);
          closeSheet();
          if (f) amountSheet(f, meal, pick);
          else { toast("Not in Open Food Facts yet. Enter it from the label."); createFoodSheet(meal, code, pick); }
        } catch (e) { msg.className = "msg err"; msg.textContent = errText(e); done = false; }
      }

      try {
        if ("BarcodeDetector" in window) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
          video.srcObject = stream; await video.play();
          const det = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
          let live = true;
          stopFn = () => { live = false; stream.getTracks().forEach(t => t.stop()); };
          msg.textContent = "Point the camera at the barcode.";
          const loop = async () => { if (!live) return; try { const r = await det.detect(video); if (r.length) return found(r[0].rawValue); } catch (_) {} requestAnimationFrame(loop); };
          loop();
        } else {
          await loadScript("https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js");
          const reader = new window.ZXing.BrowserMultiFormatReader(new Map(), 300);
          stopFn = () => reader.reset();
          msg.textContent = "Point the camera at the barcode.";
          await reader.decodeFromConstraints({ video: { facingMode: "environment" } }, video, (res) => { if (res) found(res.getText()); });
        }
      } catch (e) {
        msg.className = "msg err";
        msg.textContent = /denied|notallowed/i.test(String(e && (e.name || e.message))) ? "Camera access is off. Allow it in Settings → Safari → Camera, or type the number below." : "The camera couldn't start. Type the barcode number below.";
      }
    });
  }

  // ================= CALENDAR =================
  function calendarSheet() {
    let cm = new Date(parse(S.day).getFullYear(), parse(S.day).getMonth(), 1);
    const t = today();
    openSheet(el => {
      const pg = h("div", { class: "page" }); el.append(pg);
      const title = h("h3", { style: "text-align:center" }), grid = h("div");
      const next = h("button", { class: "iconbtn", "aria-label": "Next month", text: "›" });
      async function draw() {
        title.textContent = cm.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
        const first = iso(cm), last = iso(new Date(cm.getFullYear(), cm.getMonth() + 1, 0));
        const now = new Date();
        next.disabled = cm.getFullYear() === now.getFullYear() && cm.getMonth() === now.getMonth();
        const { data } = await sb.from("diary_entries").select("date").gte("date", first).lte("date", last);
        const logged = new Set((data || []).map(x => x.date));
        const cal = h("div", { class: "cal" });
        ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].forEach(d => cal.append(h("div", { class: "dn", text: d })));
        for (let i = 0; i < (cm.getDay() + 6) % 7; i++) cal.append(h("span"));
        const dim = new Date(cm.getFullYear(), cm.getMonth() + 1, 0).getDate();
        for (let d = 1; d <= dim; d++) {
          const k = iso(new Date(cm.getFullYear(), cm.getMonth(), d));
          const b = h("button", { class: k === t ? "today" : null, "aria-current": k === S.day ? "date" : null, disabled: k > t, "aria-label": parse(k).toDateString() + (logged.has(k) ? ", food logged" : "") },
            h("span", { class: "num", text: d }), logged.has(k) ? h("span", { class: "dot" }) : h("span", { style: "height:5px" }));
          b.addEventListener("click", async () => { S.day = k; closeSheet(); await refresh(); });
          cal.append(b);
        }
        grid.innerHTML = ""; grid.append(cal);
      }
      next.addEventListener("click", () => { cm = new Date(cm.getFullYear(), cm.getMonth() + 1, 1); draw(); });
      pg.append(sheetHead("Pick a date", { left: ["Close", closeSheet] }),
        h("section", { class: "card" },
          h("div", { style: "display:grid;grid-template-columns:44px 1fr 44px;align-items:center" },
            h("button", { class: "iconbtn", "aria-label": "Previous month", text: "‹", onclick: () => { cm = new Date(cm.getFullYear(), cm.getMonth() - 1, 1); draw(); } }), title, next),
          grid, h("div", { class: "tiny muted" }, h("span", { style: "display:inline-block;width:6px;height:6px;border-radius:3px;background:var(--accent);margin-right:6px" }), "food logged")),
        h("button", { class: "btn ghost", text: "Go to today", onclick: async () => { S.day = t; closeSheet(); await refresh(); } }));
      draw();
    });
  }

  // ================= boot =================
  async function enter(session) {
    S.user = session.user;
    app().innerHTML = '<main class="auth"><p class="muted" style="text-align:center">Loading…</p></main>';
    try { await loadProfile(); } catch (e) { app().innerHTML = ""; app().append(h("main", { class: "auth" }, h("div", { class: "banner", text: "Couldn't load your profile: " + errText(e) + " If this is the first run, check that the database script has been run in Supabase." }))); return; }
    if (!S.profile) { app().innerHTML = ""; app().append(h("main", { class: "auth" }, h("div", { class: "banner", text: "Your profile row is missing. Run the database script in Supabase, then reopen the app." }))); return; }
    await refresh();
    if (!S.profile.completed) profileSheet(true);
  }

  let current;
  sb.auth.onAuthStateChange((evt, session) => {
    const id = session ? session.user.id : null;
    if (id === current) return;
    current = id;
    if (session) setTimeout(() => enter(session), 0); else { S.user = null; closeAll(); renderAuth(); }
  });

  // New day while the app stayed open
  let lastToday = today();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !S.user) return;
    const n = today();
    if (n !== lastToday) { if (S.day === lastToday) S.day = n; lastToday = n; refresh(); }
  });
})();
