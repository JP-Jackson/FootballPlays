// Football Plays — Worker entry point.
// Every request lands here first (assets.run_worker_first), which is what lets
// the login gate run before any page is served. Nothing but the login screen,
// the branding files and the setup flow is reachable signed out.

import {
  json, parseCookies, readSession, clearedCookie, SESSION_COOKIE,
} from "./shared.js";
import { handleAuth, handleChangePassword, countUsers } from "./auth.js";
import { handleUsers } from "./users.js";
import { handlePlays } from "./plays.js";
import { handleHistory } from "./history.js";
import { handleFeedbackSubmit, handleFeedbackAdmin } from "./feedback.js";
import { VERSION, RELEASES } from "./releases.js";

// Reachable without signing in. The login and setup screens are useless without
// their stylesheet and the logo, so the shared chrome has to be public too —
// none of it contains anything private.
const PUBLIC_EXACT = new Set([
  "/login", "/setup", "/api/login", "/api/setup",
  "/shell.css", "/shell.js", "/favicon.ico",
]);
const PUBLIC_PREFIX = ["/brand/"];

const isPublic = path =>
  PUBLIC_EXACT.has(path) || PUBLIC_PREFIX.some(p => path.startsWith(p));

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = request.method;

    try {
      return await route(request, env, url, path, method);
    } catch (err) {
      // A missing SESSION_SECRET is a deployment mistake, not a user error —
      // say so plainly instead of a blank 500.
      const msg = err?.message || "Something went wrong.";
      if (msg.includes("SESSION_SECRET")) {
        return new Response(configPage(msg), { status: 500, headers: html() });
      }
      console.error("Unhandled error on", method, path, "-", err?.stack || msg);
      return url.pathname.startsWith("/api") || url.pathname.startsWith("/admin/api")
        ? json({ error: "Something went wrong on our end.", detail: msg }, 500)
        : new Response("Something went wrong: " + msg, { status: 500 });
    }
  },
};

async function route(request, env, url, path, method) {
  const isApi = path.startsWith("/api/") || path.startsWith("/admin/api/");

  /* ── Before anything: has anyone set this up yet? ───────────────────── */
  const usersExist = await countUsers(env) > 0;
  if (!usersExist && !isPublic(path)) {
    return isApi
      ? json({ error: "This site hasn't been set up yet." }, 503)
      : redirect("/setup");
  }
  if (usersExist && path === "/setup") return redirect("/login");

  /* ── Public auth routes ────────────────────────────────────────────── */
  const authed = await handleAuth(request, env, path, method);
  if (authed) return authed;

  if (path === "/login") return asset(request, env, "/login.html");
  if (path === "/setup") return asset(request, env, "/setup.html");

  if (isPublic(path)) return env.ASSETS.fetch(request);

  /* ── Everything below requires a session ───────────────────────────── */
  const cookies = parseCookies(request.headers.get("Cookie"));
  const user = await readSession(env, cookies[SESSION_COOKIE]);
  if (!user) {
    if (isApi) return json({ error: "Please sign in again." }, 401);
    // Clear the stale cookie on the way out so the browser stops sending it.
    return new Response(null, {
      status: 302,
      headers: { Location: `/login?next=${encodeURIComponent(path)}`, "Set-Cookie": clearedCookie() },
    });
  }

  /* ── Signed-in APIs ────────────────────────────────────────────────── */
  if (path === "/api/me" && method === "GET") {
    return json({
      user: {
        id: user.id, username: user.username, name: user.name, email: user.email,
        team: user.team, role: user.role, must_change_password: !!user.must_change_password,
      },
    });
  }
  if (path === "/api/version" && method === "GET") return json({ version: VERSION, releases: RELEASES });
  if (path === "/version") return asset(request, env, "/version.html");
  if (path === "/api/password" && method === "PUT") return handleChangePassword(request, env, user);
  if (path === "/api/feedback" && method === "POST") return handleFeedbackSubmit(request, env, user);

  const plays = await handlePlays(request, env, path, method, user);
  if (plays) return plays;

  const history = await handleHistory(request, env, path, method, user);
  if (history) return history;

  if (path === "/history") return asset(request, env, "/history.html");

  /* ── Admin only ────────────────────────────────────────────────────── */
  if (path.startsWith("/admin")) {
    if (user.role !== "admin") {
      return isApi
        ? json({ error: "That area is admin only." }, 403)
        : new Response(deniedPage(user), { status: 403, headers: html() });
    }
    if (path === "/admin" || path === "/admin/feedback") return asset(request, env, "/admin-feedback.html");
    if (path === "/admin/users") return asset(request, env, "/admin-users.html");

    const fb = await handleFeedbackAdmin(request, env, path, method, user);
    if (fb) return fb;
    const us = await handleUsers(request, env, path, method, user);
    if (us) return us;

    if (isApi) return json({ error: "Not found." }, 404);
  }

  if (isApi) return json({ error: "Not found." }, 404);

  /* ── The app itself ────────────────────────────────────────────────── */
  if (path === "/" || path === "/app") return asset(request, env, "/index.html");
  return env.ASSETS.fetch(request);
}

/* ── helpers ─────────────────────────────────────────────────────────── */
const html = () => ({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
const redirect = to => new Response(null, { status: 302, headers: { Location: to } });

/** Serve a file from public/ under a different URL than its filename. */
function asset(request, env, file) {
  const u = new URL(request.url);
  u.pathname = file;
  return env.ASSETS.fetch(new Request(u, { method: "GET", headers: request.headers }));
}

function shell(title, bodyHtml) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Football Plays</title>
<link rel="icon" href="/brand/jp-logo.svg">
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f2f5f8;
       font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#16202b}
  .card{background:#fff;border:1px solid #dde4ec;border-radius:14px;padding:30px 34px;max-width:460px;
        box-shadow:0 10px 34px rgba(16,32,50,.09);text-align:center}
  img{width:56px;height:56px;border-radius:13px;margin-bottom:14px}
  h1{margin:0 0 8px;font-size:20px}
  p{margin:0 0 6px;color:#5b6b7c}
  code{background:#eef2f7;padding:2px 6px;border-radius:5px;font-size:13px}
  a{display:inline-block;margin-top:16px;background:#1f7a45;color:#fff;text-decoration:none;
    padding:9px 18px;border-radius:8px;font-weight:650}
</style></head><body><div class="card">
<img src="/brand/jp-logo.svg" alt="">${bodyHtml}</div></body></html>`;
}

const deniedPage = user => shell("Not allowed", `
  <h1>Admin only</h1>
  <p>${user.name || user.username}, the admin area isn't part of your account.</p>
  <a href="/">Back to the playbook</a>`);

const configPage = msg => shell("Setup needed", `
  <h1>Almost there</h1>
  <p>${msg}</p>
  <p style="margin-top:12px"><code>npx wrangler secret put SESSION_SECRET</code></p>`);
