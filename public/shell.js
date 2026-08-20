/* Shared front-end chrome: API helper, toasts, the header, and the feedback
   widget that appears on every signed-in page. */
(function (global) {
  "use strict";

  /* ── API ───────────────────────────────────────────────────────────── */
  async function api(path, options) {
    const opts = Object.assign({ headers: {} }, options);
    if (opts.body !== undefined && typeof opts.body !== "string") {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(opts.body);
    }
    const res = await fetch(path, opts);
    // A dead session should send you back to sign in, not fail mysteriously.
    if (res.status === 401 && !path.endsWith("/api/login")) {
      location.href = "/login?next=" + encodeURIComponent(location.pathname);
      throw new Error("Signed out");
    }
    let data = null;
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) throw Object.assign(new Error((data && data.error) || "Something went wrong."), { status: res.status, data });
    return data;
  }

  /* ── toast ─────────────────────────────────────────────────────────── */
  let toastEl, toastTimer;
  function toast(message, bad) {
    if (!toastEl) {
      // The play designer ships its own #toast; reuse it so a page never ends
      // up with two stacked toasts saying different things.
      toastEl = document.getElementById("toast");
      if (!toastEl) {
        toastEl = document.createElement("div");
        toastEl.className = "toast";
        document.body.appendChild(toastEl);
      }
    }
    toastEl.textContent = message;
    toastEl.classList.toggle("bad", !!bad);
    toastEl.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("on"); }, 2600);
  }

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ── header ────────────────────────────────────────────────────────── */
  function header(user, active) {
    const isAdmin = user && user.role === "admin";
    const nav = [
      { href: "/", label: "Playbook", key: "app" },
      isAdmin ? { href: "/admin/feedback", label: "Feedback", key: "feedback" } : null,
      isAdmin ? { href: "/admin/users", label: "Access & Roles", key: "users" } : null,
    ].filter(Boolean);

    return '<a class="brand" href="/">' +
      '<img src="/brand/jp-logo.svg" alt="">' +
      '<div><h1>Football Plays</h1><p id="sh-ver">Play designer</p></div></a>' +
      '<div class="tb-actions">' +
        nav.map(n => '<a class="btn ' + (n.key === active ? "primary" : "ghost") +
                     '" href="' + n.href + '" style="text-decoration:none">' + esc(n.label) + "</a>").join("") +
        (user ? '<span class="who"><b>' + esc(user.name || user.username) + "</b>" +
                 (isAdmin ? '<span class="pill-role">Admin</span>' : "") + "</span>" +
                 '<button class="btn ghost" id="sh-account">Account</button>' +
                 '<button class="btn ghost" id="sh-signout">Sign out</button>' : "") +
      "</div>";
  }

  /* ── feedback widget ───────────────────────────────────────────────── */
  const PAGE_NAMES = {
    "/": "Play designer",
    "/app": "Play designer",
    "/admin/feedback": "Feedback admin",
    "/admin/users": "Access & Roles",
  };

  function mountFeedback(user) {
    const btn = document.createElement("button");
    btn.className = "fb-btn";
    btn.id = "fb-open";
    btn.innerHTML = "<span aria-hidden=\"true\">💬</span> Feedback";
    document.body.appendChild(btn);

    const wrap = document.createElement("div");
    wrap.className = "modal";
    wrap.id = "fb-modal";
    const firstName = ((user && (user.name || user.username)) || "").split(" ")[0];
    const pageName = PAGE_NAMES[location.pathname] || "this page";
    wrap.innerHTML =
      '<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="fb-title">' +
        '<div class="sheet-hd"><h2 id="fb-title">Send feedback</h2>' +
          '<button class="x" data-fb-close aria-label="Close">&times;</button></div>' +
        '<div class="sheet-bd">' +
          "<p style=\"margin:0;color:#5b6b7c;font-size:13.5px\">" +
            (firstName ? esc(firstName) + ", found" : "Found") +
            " something broken, or thought of something the app should do? Tell JP." +
          "</p>" +
          '<div class="field"><label for="fb-cat">What kind of feedback?</label>' +
            '<select id="fb-cat">' +
              '<option value="bug">Bug / Problem</option>' +
              '<option value="idea">Idea / Suggestion</option>' +
              '<option value="other">Other</option>' +
            "</select></div>" +
          '<div class="field"><label for="fb-msg">Your message</label>' +
            '<textarea id="fb-msg" maxlength="4000" placeholder="The more specific, the faster it gets fixed."></textarea></div>' +
          '<div class="fb-ctx">Sent as <b>' + esc((user && (user.name || user.username)) || "you") +
            "</b> from <b>" + esc(pageName) + "</b>. JP gets an email right away.</div>" +
          '<div class="err" id="fb-err"></div>' +
        "</div>" +
        '<div class="sheet-ft">' +
          '<button class="btn plain" data-fb-close>Cancel</button>' +
          '<button class="btn primary" id="fb-send">Send feedback</button>' +
        "</div>" +
      "</div>";
    document.body.appendChild(wrap);

    const msg = wrap.querySelector("#fb-msg");
    const err = wrap.querySelector("#fb-err");
    const send = wrap.querySelector("#fb-send");

    function open() {
      err.classList.remove("on");
      wrap.classList.add("on");
      setTimeout(function () { msg.focus(); }, 50);
    }
    function close() { wrap.classList.remove("on"); }

    btn.addEventListener("click", open);
    // Anything on the page can open it, e.g. an inline "tell us" link.
    document.querySelectorAll("[data-feedback-open]").forEach(el =>
      el.addEventListener("click", e => { e.preventDefault(); open(); }));
    wrap.addEventListener("click", function (e) {
      if (e.target === wrap || e.target.closest("[data-fb-close]")) close();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && wrap.classList.contains("on")) close();
    });

    send.addEventListener("click", async function () {
      const text = msg.value.trim();
      if (!text) { err.textContent = "Type a message before sending."; err.classList.add("on"); msg.focus(); return; }
      send.disabled = true;
      send.textContent = "Sending…";
      try {
        await api("/api/feedback", {
          method: "POST",
          body: { category: wrap.querySelector("#fb-cat").value, message: text, page_path: location.pathname },
        });
        msg.value = "";
        close();
        toast(firstName ? "Thanks, " + firstName + "! Your feedback was sent." : "Thanks — your feedback was sent.");
      } catch (e) {
        err.textContent = e.message;
        err.classList.add("on");
      } finally {
        send.disabled = false;
        send.textContent = "Send feedback";
      }
    });
  }

  /* ── account (change your own password) ────────────────────────────── */
  function mountAccount(user) {
    const wrap = document.createElement("div");
    wrap.className = "modal";
    wrap.id = "acct-modal";
    wrap.innerHTML =
      '<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="acct-title">' +
        '<div class="sheet-hd"><h2 id="acct-title">Your account</h2>' +
          '<button class="x" data-acct-close aria-label="Close">&times;</button></div>' +
        '<div class="sheet-bd">' +
          '<p style="margin:0 0 4px;font-size:13.5px;color:#5b6b7c">Signed in as <b>' +
            esc(user.username) + "</b> &middot; team <b>" + esc(user.team) + "</b></p>" +
          '<h3 style="margin:18px 0 0;font-size:14px">Change your password</h3>' +
          '<div class="field"><label for="ac-cur">Current password</label>' +
            '<input type="password" id="ac-cur" autocomplete="current-password"></div>' +
          '<div class="field"><label for="ac-new">New password</label>' +
            '<input type="password" id="ac-new" autocomplete="new-password"></div>' +
          '<p class="hint">At least 8 characters.</p>' +
          '<div class="err" id="ac-err"></div><div class="ok" id="ac-ok"></div>' +
        "</div>" +
        '<div class="sheet-ft"><button class="btn plain" data-acct-close>Close</button>' +
          '<button class="btn primary" id="ac-save">Change password</button></div>' +
      "</div>";
    document.body.appendChild(wrap);

    const err = wrap.querySelector("#ac-err"), ok = wrap.querySelector("#ac-ok");
    wrap.addEventListener("click", e => {
      if (e.target === wrap || e.target.closest("[data-acct-close]")) wrap.classList.remove("on");
    });
    wrap.querySelector("#ac-save").addEventListener("click", async function () {
      err.classList.remove("on"); ok.classList.remove("on");
      try {
        await api("/api/password", { method: "PUT", body: {
          current: wrap.querySelector("#ac-cur").value,
          next: wrap.querySelector("#ac-new").value,
        } });
        wrap.querySelector("#ac-cur").value = wrap.querySelector("#ac-new").value = "";
        ok.textContent = "Password changed.";
        ok.classList.add("on");
      } catch (e) { err.textContent = e.message; err.classList.add("on"); }
    });
    return wrap;
  }

  /* ── boot ──────────────────────────────────────────────────────────── */
  async function start(activeKey) {
    const me = await api("/api/me");
    const user = me.user;
    const bar = document.querySelector(".topbar");
    if (bar) bar.innerHTML = header(user, activeKey);

    const acct = mountAccount(user);
    const acctBtn = document.getElementById("sh-account");
    if (acctBtn) acctBtn.addEventListener("click", () => acct.classList.add("on"));

    const out = document.getElementById("sh-signout");
    if (out) out.addEventListener("click", async function () {
      await api("/api/logout", { method: "POST" });
      location.href = "/login";
    });

    mountFeedback(user);

    // Show which version is running, linking to what changed in it. Best-effort:
    // the header should never fail to render because a version lookup did.
    api("/api/version").then(function (v) {
      const el = document.getElementById("sh-ver");
      if (el) el.innerHTML = 'Play designer · <a href="/version" style="color:#9fb4cd">v' + esc(v.version) + "</a>";
    }).catch(function () {});

    // Someone whose password was set by an admin gets nudged once, on arrival.
    if (user.must_change_password) {
      acct.classList.add("on");
      toast("Set your own password to finish signing in");
    }
    return user;
  }

  global.Shell = { api, toast, esc, start };
})(window);
