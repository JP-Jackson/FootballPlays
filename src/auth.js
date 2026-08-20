// Signing in, signing out, changing your own password, and the one-time
// creation of the very first admin.

import {
  json, hashPassword, verifyPassword, makeSession, sessionCookie, clearedCookie,
  logAudit, uid, now,
} from "./shared.js";

// Deliberately vague: saying "no such user" tells an attacker which usernames
// are real. Both wrong-username and wrong-password land here.
const BAD_LOGIN = "That username and password don't match.";

export async function countUsers(env) {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first();
  return row?.n ?? 0;
}

export function passwordProblem(pw) {
  const s = String(pw || "");
  if (s.length < 8) return "Password must be at least 8 characters.";
  if (s.length > 200) return "Password is too long.";
  return null;
}

export function usernameProblem(name) {
  const s = String(name || "").trim();
  if (s.length < 2) return "Username must be at least 2 characters.";
  if (s.length > 40) return "Username is too long.";
  if (!/^[a-zA-Z0-9._-]+$/.test(s)) return "Username can use letters, numbers, dots, dashes and underscores only.";
  return null;
}

export async function handleAuth(request, env, path, method) {

  /* ── First-run setup ──────────────────────────────────────────────────
     Only works while the users table is empty, so it closes itself the
     moment the first admin exists and can never be used to add a second. */
  if (path === "/api/setup" && method === "POST") {
    if (await countUsers(env) > 0) {
      return json({ error: "Setup is already complete. Sign in instead." }, 409);
    }
    const body = await request.json().catch(() => ({}));
    const username = String(body.username || "").trim();
    const name = String(body.name || "").trim() || username;
    const email = String(body.email || "").trim() || null;
    const team = String(body.team || "").trim() || "default";

    const uProblem = usernameProblem(username);
    if (uProblem) return json({ error: uProblem }, 400);
    const pProblem = passwordProblem(body.password);
    if (pProblem) return json({ error: pProblem }, 400);

    const user = {
      id: uid(), username, name, email, team, role: "admin",
      password_hash: await hashPassword(body.password),
    };
    await env.DB.prepare(
      `INSERT INTO users (id, username, name, email, team, role, password_hash, active, must_change_password, created_at, created_by)
       VALUES (?,?,?,?,?,?,?,1,0,?,?)`
    ).bind(user.id, user.username, user.name, user.email, user.team, user.role,
           user.password_hash, now(), "setup").run();

    await logAudit(env, { area: "users", action: "first_admin_created", target: username, changedBy: username });
    return json({ ok: true }, 201);
  }

  /* ── Sign in ─────────────────────────────────────────────────────────── */
  if (path === "/api/login" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (!username || !password) return json({ error: BAD_LOGIN }, 401);

    const user = await env.DB.prepare(
      "SELECT * FROM users WHERE lower(username)=lower(?)"
    ).bind(username).first();

    // Run the same work whether or not the user exists, so a missing account
    // and a wrong password take the same amount of time.
    const stored = user?.password_hash
      || "pbkdf2$210000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const ok = await verifyPassword(password, stored);

    if (!user || !ok) return json({ error: BAD_LOGIN }, 401);
    if (!user.active) return json({ error: "That account has been turned off. Ask an admin to turn it back on." }, 403);

    await env.DB.prepare("UPDATE users SET last_login_at=? WHERE id=?")
      .bind(now(), user.id).run().catch(() => {});

    return new Response(
      JSON.stringify({ ok: true, must_change_password: !!user.must_change_password }),
      { headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Set-Cookie": sessionCookie(await makeSession(env, user)),
      } }
    );
  }

  /* ── Sign out ────────────────────────────────────────────────────────── */
  if (path === "/api/logout" && method === "POST") {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json", "Set-Cookie": clearedCookie() },
    });
  }

  return null;   // not an auth route
}

/* ── Changing your own password (signed in) ─────────────────────────────── */
export async function handleChangePassword(request, env, user) {
  const body = await request.json().catch(() => ({}));
  const full = await env.DB.prepare("SELECT password_hash FROM users WHERE id=?").bind(user.id).first();
  if (!full || !(await verifyPassword(String(body.current || ""), full.password_hash))) {
    return json({ error: "Your current password isn't right." }, 403);
  }
  const problem = passwordProblem(body.next);
  if (problem) return json({ error: problem }, 400);

  await env.DB.prepare(
    "UPDATE users SET password_hash=?, must_change_password=0, updated_at=?, updated_by=? WHERE id=?"
  ).bind(await hashPassword(body.next), now(), user.username, user.id).run();

  await logAudit(env, { area: "users", action: "password_changed", target: user.username, changedBy: user.username });
  return json({ ok: true });
}
