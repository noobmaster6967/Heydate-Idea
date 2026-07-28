/* =====================================================================
   heydate — real accounts (Supabase auth + cloud state)
   Replaces the hardcoded password gate.

   Setup: paste your project URL + anon key below (see SETUP.md).
   The anon key is meant to be public — Row Level Security is what
   protects the data, and supabase-schema.sql sets that up.
   ===================================================================== */
(function () {
  "use strict";

  // ---------------------------------------------------------------- config
  const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
  const SUPABASE_ANON_KEY = "YOUR-PUBLIC-ANON-KEY";
  const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";

  const HD = (window.HD = window.HD || {});
  let sb = null;
  let user = null;
  let profile = null;
  let saveTimer = null;

  // ---------------------------------------------------------------- gate UI
  const gate = document.createElement("div");
  gate.id = "hd-gate";
  gate.setAttribute("style", [
    "position:fixed", "inset:0", "z-index:99999",
    "background:linear-gradient(135deg,#f0512f,#e83e8c)",
    "display:flex", "align-items:center", "justify-content:center",
    "padding:24px 16px", "overflow-y:auto",
    "font-family:Inter,system-ui,-apple-system,sans-serif"
  ].join(";"));
  gate.innerHTML = `
    <div style="background:#fff;padding:34px 32px;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,.25);
                max-width:390px;width:100%;box-sizing:border-box">
      <div style="text-align:center;margin-bottom:20px">
        <div style="font-size:34px;line-height:1">🎁</div>
        <h1 style="margin:6px 0 4px;font-size:23px;color:#16181d;font-weight:900;letter-spacing:-.03em">heydate</h1>
        <p id="hd-gate-tagline" style="margin:0;color:#667085;font-size:13.5px">Never miss a special date.</p>
      </div>

      <div id="hd-tabs" style="display:flex;gap:4px;background:#f1f1f6;border-radius:999px;padding:4px;margin-bottom:18px">
        <button type="button" data-mode="signin" style="flex:1;border:none;background:#fff;border-radius:999px;padding:9px;
          font:inherit;font-size:13.5px;font-weight:700;color:#16181d;cursor:pointer;box-shadow:0 1px 2px rgba(16,24,40,.06)">Sign in</button>
        <button type="button" data-mode="signup" style="flex:1;border:none;background:none;border-radius:999px;padding:9px;
          font:inherit;font-size:13.5px;font-weight:600;color:#667085;cursor:pointer">Create account</button>
      </div>

      <form id="hd-form" autocomplete="on" novalidate>
        <div id="hd-name-wrap" style="display:none">
          <label style="display:block;font-size:11px;font-weight:800;color:#667085;text-transform:uppercase;
            letter-spacing:.05em;margin:0 0 6px">Your name</label>
          <input id="hd-name" type="text" autocomplete="name" placeholder="Alex Rivera" style="width:100%;box-sizing:border-box;
            padding:11px 13px;border:1.5px solid #eaecf0;border-radius:11px;font:inherit;font-size:14.5px;
            background:#fcfcfd;margin-bottom:12px">
        </div>

        <label style="display:block;font-size:11px;font-weight:800;color:#667085;text-transform:uppercase;
          letter-spacing:.05em;margin:0 0 6px">Email</label>
        <input id="hd-email" type="email" autocomplete="email" placeholder="you@example.com" style="width:100%;box-sizing:border-box;
          padding:11px 13px;border:1.5px solid #eaecf0;border-radius:11px;font:inherit;font-size:14.5px;
          background:#fcfcfd;margin-bottom:12px">

        <label style="display:block;font-size:11px;font-weight:800;color:#667085;text-transform:uppercase;
          letter-spacing:.05em;margin:0 0 6px">Password</label>
        <input id="hd-password" type="password" autocomplete="current-password" placeholder="••••••••" style="width:100%;box-sizing:border-box;
          padding:11px 13px;border:1.5px solid #eaecf0;border-radius:11px;font:inherit;font-size:14.5px;background:#fcfcfd">
        <p id="hd-pw-hint" style="display:none;margin:7px 0 0;color:#98a2b3;font-size:12px">At least 8 characters.</p>

        <div id="hd-phone-wrap" style="display:none">
          <label style="display:block;font-size:11px;font-weight:800;color:#667085;text-transform:uppercase;
            letter-spacing:.05em;margin:14px 0 6px">Phone for text reminders <span style="font-weight:600;text-transform:none;letter-spacing:0">(optional)</span></label>
          <input id="hd-phone" type="tel" autocomplete="tel" placeholder="(555) 010-1234" style="width:100%;box-sizing:border-box;
            padding:11px 13px;border:1.5px solid #eaecf0;border-radius:11px;font:inherit;font-size:14.5px;background:#fcfcfd">
        </div>

        <button id="hd-submit" type="submit" style="width:100%;margin-top:18px;padding:12px;border:none;border-radius:12px;
          background:linear-gradient(135deg,#f0512f 0%,#e83e8c 100%);color:#fff;font:inherit;font-size:14.5px;
          font-weight:700;cursor:pointer;box-shadow:0 6px 16px -6px rgba(240,81,47,.5)">Sign in</button>
      </form>

      <p id="hd-msg" style="display:none;font-size:13px;margin:14px 0 0;padding:11px 13px;border-radius:11px;line-height:1.45"></p>

      <p style="text-align:center;margin:16px 0 0">
        <button type="button" id="hd-forgot" style="border:none;background:none;color:#667085;font:inherit;font-size:12.5px;
          font-weight:600;cursor:pointer;text-decoration:underline">Forgot your password?</button>
      </p>
    </div>`;

  function mountGate() {
    document.body.appendChild(gate);
    document.body.style.overflow = "hidden";
  }
  if (document.body) mountGate();
  else document.addEventListener("DOMContentLoaded", mountGate);

  const $ = (id) => document.getElementById(id);
  let mode = "signin";

  function setMode(next) {
    mode = next;
    const isUp = mode === "signup";
    $("hd-name-wrap").style.display = isUp ? "block" : "none";
    $("hd-phone-wrap").style.display = isUp ? "block" : "none";
    $("hd-pw-hint").style.display = isUp ? "block" : "none";
    $("hd-password").setAttribute("autocomplete", isUp ? "new-password" : "current-password");
    $("hd-submit").textContent = isUp ? "Create account" : "Sign in";
    $("hd-tabs").querySelectorAll("button").forEach((b) => {
      const on = b.dataset.mode === mode;
      b.style.background = on ? "#fff" : "none";
      b.style.color = on ? "#16181d" : "#667085";
      b.style.fontWeight = on ? "700" : "600";
      b.style.boxShadow = on ? "0 1px 2px rgba(16,24,40,.06)" : "none";
    });
    hideMsg();
  }

  function showMsg(text, kind) {
    const el = $("hd-msg");
    el.textContent = text;
    el.style.display = "block";
    if (kind === "good") {
      el.style.background = "#e7f8f1";
      el.style.color = "#12996b";
      el.style.border = "1px solid #b8e8d4";
    } else {
      el.style.background = "#fff0ec";
      el.style.color = "#c2410c";
      el.style.border = "1px solid #ffd9cf";
    }
  }
  function hideMsg() { $("hd-msg").style.display = "none"; }
  function busy(on, label) {
    const b = $("hd-submit");
    b.disabled = on;
    b.style.opacity = on ? ".65" : "1";
    b.textContent = on ? (label || "Working…") : (mode === "signup" ? "Create account" : "Sign in");
  }

  // ------------------------------------------------------------ load client
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Could not load " + src));
      document.head.appendChild(s);
    });
  }

  async function init() {
    if (SUPABASE_URL.indexOf("YOUR-PROJECT-REF") !== -1) {
      showMsg("heydate-auth.js still has placeholder credentials. Add your Supabase URL and anon key (see SETUP.md).", "bad");
      return;
    }
    try {
      await loadScript(SUPABASE_JS);
    } catch (e) {
      showMsg("Couldn't reach Supabase. Check your connection and reload.", "bad");
      return;
    }
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    HD.supabase = sb;

    sb.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") { promptNewPassword(); return; }
      if (event === "SIGNED_OUT") { window.location.reload(); return; }
      if (event === "SIGNED_IN" && session && !user) enter(session.user);
    });

    const { data } = await sb.auth.getSession();
    if (data && data.session) enter(data.session.user);
  }

  // ------------------------------------------------------------ auth actions
  function wireForm() {
    $("hd-tabs").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-mode]");
      if (b) setMode(b.dataset.mode);
    });

    $("hd-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!sb) return;
      hideMsg();
      const email = $("hd-email").value.trim();
      const password = $("hd-password").value;
      if (!email || !password) { showMsg("Email and password are both required.", "bad"); return; }

      if (mode === "signup") {
        if (password.length < 8) { showMsg("Please use a password of at least 8 characters.", "bad"); return; }
        busy(true, "Creating account…");
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: $("hd-name").value.trim(),
              phone: $("hd-phone").value.trim()
            },
            emailRedirectTo: window.location.href.split("#")[0]
          }
        });
        busy(false);
        if (error) { showMsg(error.message, "bad"); return; }
        if (data.session) { enter(data.session.user); return; }
        setMode("signin");
        showMsg("Check " + email + " for a confirmation link, then sign in.", "good");
        return;
      }

      busy(true, "Signing in…");
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      busy(false);
      if (error) { showMsg(error.message, "bad"); return; }
      enter(data.user);
    });

    $("hd-forgot").addEventListener("click", async () => {
      if (!sb) return;
      const email = $("hd-email").value.trim();
      if (!email) { showMsg("Enter your email above first, then tap this again.", "bad"); return; }
      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.href.split("#")[0]
      });
      showMsg(error ? error.message : "Password reset link sent to " + email + ".", error ? "bad" : "good");
    });
  }

  async function promptNewPassword() {
    const pw = window.prompt("Enter a new password for heydate (at least 8 characters):");
    if (!pw) return;
    if (pw.length < 8) { showMsg("Password must be at least 8 characters. Use the reset link again.", "bad"); return; }
    const { error } = await sb.auth.updateUser({ password: pw });
    showMsg(error ? error.message : "Password updated — you're signed in.", error ? "bad" : "good");
  }

  // ------------------------------------------------------------ enter the app
  async function enter(u) {
    user = u;
    busy(true, "Loading your dates…");

    const [profRes, stateRes] = await Promise.all([
      sb.from("profiles").select("*").eq("id", u.id).maybeSingle(),
      sb.from("user_state").select("*").eq("user_id", u.id).maybeSingle()
    ]);

    profile = profRes.data || { id: u.id, email: u.email, full_name: "", phone: "", notify_channel: "text" };
    if (!profRes.data) await sb.from("profiles").upsert(profile);

    let state = stateRes.data;
    if (!state) {
      state = { user_id: u.id, people: [], dismissed: {}, purchases: {}, deals_seen: {} };
      await sb.from("user_state").upsert(state);
    }

    state = await maybeImportLocal(state);

    await whenAppReady();
    HD.hydrate({
      people: state.people || [],
      dismissed: state.dismissed || {},
      purchases: state.purchases || {},
      deals_seen: state.deals_seen || {}
    });

    wrapSaves();
    injectAccountUI();

    document.body.style.overflow = "";
    gate.remove();
  }

  /* First sign-in on a browser that already has prototype data: move it up
     to the account instead of losing it. */
  async function maybeImportLocal(state) {
    const cloudEmpty = !state.people || state.people.length === 0;
    if (!cloudEmpty) return state;
    let local = null;
    try { local = JSON.parse(localStorage.getItem("heydate_people") || "null"); } catch (e) { /* ignore */ }
    if (!Array.isArray(local) || !local.length) return state;
    if (!window.confirm("Found " + local.length + " people saved in this browser. Import them into your account?")) return state;
    const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || "{}"); } catch (e) { return {}; } };
    const merged = {
      user_id: user.id,
      people: local,
      dismissed: read("heydate_dismissed"),
      purchases: read("heydate_purchases"),
      deals_seen: read("heydate_deals_seen")
    };
    await sb.from("user_state").upsert(merged);
    return merged;
  }

  function whenAppReady() {
    if (HD.ready) return Promise.resolve();
    return new Promise((resolve) => {
      document.addEventListener("hd-app-ready", () => resolve(), { once: true });
      const t = setInterval(() => { if (HD.ready) { clearInterval(t); resolve(); } }, 40);
    });
  }

  // ------------------------------------------------------------ cloud sync
  function push() {
    if (!user || !HD.snapshot) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const snap = HD.snapshot();
      const { error } = await sb.from("user_state").upsert({
        user_id: user.id,
        people: snap.people,
        dismissed: snap.dismissed,
        purchases: snap.purchases,
        deals_seen: snap.deals_seen
      });
      if (error && window.toast) window.toast("Couldn't sync to your account — retrying on next change");
    }, 700);
  }
  HD.push = push;

  /* The app's own save functions still write localStorage (a handy offline
     cache). We wrap them so every write also goes to the account. */
  function wrapSaves() {
    ["save", "savePurchases", "notifyDeal"].forEach((name) => {
      const original = window[name];
      if (typeof original !== "function") return;
      window[name] = function () {
        const out = original.apply(this, arguments);
        push();
        return out;
      };
    });
    window.addEventListener("beforeunload", () => {
      if (!user || !HD.snapshot) return;
      clearTimeout(saveTimer);
      const snap = HD.snapshot();
      try {
        navigator.sendBeacon(
          SUPABASE_URL + "/rest/v1/user_state?on_conflict=user_id",
          new Blob([JSON.stringify({ user_id: user.id, ...snap })], { type: "application/json" })
        );
      } catch (e) { /* best effort */ }
    });
  }

  // ------------------------------------------------------------ account menu
  function injectAccountUI() {
    const header = document.querySelector(".header-inner");
    if (!header || document.getElementById("hd-account-btn")) return;

    const btn = document.createElement("button");
    btn.id = "hd-account-btn";
    btn.className = "btn btn-ghost btn-sm";
    btn.style.marginLeft = "8px";
    btn.textContent = "👤 " + (displayName() || user.email);
    btn.onclick = openAccountModal;
    header.appendChild(btn);

    const modal = document.createElement("div");
    modal.className = "modal-bg";
    modal.id = "hd-account-modal";
    modal.innerHTML = `
      <div class="modal">
        <h3>Your account</h3>
        <p class="sub" id="hd-acct-email"></p>
        <div class="row">
          <div><label>Name</label><input id="hd-acct-name" placeholder="Your name"></div>
          <div><label>Phone</label><input id="hd-acct-phone" placeholder="(555) 010-1234"></div>
        </div>
        <label>Default reminder channel</label>
        <select id="hd-acct-channel">
          <option value="text">Text message</option>
          <option value="email">Email</option>
          <option value="both">Text + Email</option>
        </select>
        <p class="sub" id="hd-acct-msg" style="margin:14px 0 0;display:none"></p>
        <div style="display:flex;gap:10px;margin-top:22px;justify-content:space-between;flex-wrap:wrap">
          <button class="btn btn-danger btn-sm" id="hd-signout">Sign out</button>
          <div style="display:flex;gap:10px">
            <button class="btn btn-ghost" id="hd-acct-cancel">Close</button>
            <button class="btn btn-primary" id="hd-acct-save">Save</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("open"); });

    $("hd-acct-cancel").onclick = () => modal.classList.remove("open");
    $("hd-signout").onclick = async () => { await sb.auth.signOut(); window.location.reload(); };
    $("hd-acct-save").onclick = async () => {
      const patch = {
        id: user.id,
        email: user.email,
        full_name: $("hd-acct-name").value.trim(),
        phone: $("hd-acct-phone").value.trim(),
        notify_channel: $("hd-acct-channel").value
      };
      const { error } = await sb.from("profiles").upsert(patch);
      const msg = $("hd-acct-msg");
      msg.style.display = "block";
      msg.textContent = error ? error.message : "Saved ✓";
      if (!error) {
        profile = patch;
        btn.textContent = "👤 " + (displayName() || user.email);
        if (window.toast) window.toast("Account updated ✓");
        setTimeout(() => modal.classList.remove("open"), 500);
      }
    };
  }

  function displayName() {
    return (profile && profile.full_name) ? profile.full_name.split(" ")[0] : "";
  }

  function openAccountModal() {
    $("hd-acct-email").textContent = "Signed in as " + user.email;
    $("hd-acct-name").value = (profile && profile.full_name) || "";
    $("hd-acct-phone").value = (profile && profile.phone) || "";
    $("hd-acct-channel").value = (profile && profile.notify_channel) || "text";
    $("hd-acct-msg").style.display = "none";
    document.getElementById("hd-account-modal").classList.add("open");
  }

  // ------------------------------------------------------------------ go
  function start() { wireForm(); setMode("signin"); init(); }
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
})();
