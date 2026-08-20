// Access & Roles — admin only. Creating accounts, changing roles and teams,
// turning accounts off, and resetting a forgotten password.

import { json, hashPassword, logAudit, ROLES, uid, now } from "./shared.js";
import { passwordProblem, usernameProblem } from "./auth.js";

const PUBLIC_COLUMNS =
  "id, username, name, email, team, role, active, must_change_password, last_login_at, created_at, created_by, updated_at, updated_by";

export async function handleUsers(request, env, path, method, admin) {

  if (path === "/admin/api/users" && method === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT ${PUBLIC_COLUMNS} FROM users ORDER BY active DESC, lower(name)`
    ).all();
    const { results: teams } = await env.DB.prepare(
      "SELECT team, COUNT(*) AS members FROM users GROUP BY team ORDER BY team"
    ).all();
    return json({ users: results, teams, roles: ROLES });
  }

  if (path === "/admin/api/users" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const username = String(body.username || "").trim();
    const name = String(body.name || "").trim() || username;
    const email = String(body.email || "").trim() || null;
    const team = String(body.team || "").trim() || "default";
    const role = ROLES.includes(body.role) ? body.role : "coach";

    const uProblem = usernameProblem(username);
    if (uProblem) return json({ error: uProblem }, 400);
    const pProblem = passwordProblem(body.password);
    if (pProblem) return json({ error: pProblem }, 400);

    const clash = await env.DB.prepare("SELECT id FROM users WHERE lower(username)=lower(?)").bind(username).first();
    if (clash) return json({ error: `Username "${username}" is already taken.` }, 409);

    const id = uid();
    await env.DB.prepare(
      `INSERT INTO users (id, username, name, email, team, role, password_hash, active, must_change_password, created_at, created_by)
       VALUES (?,?,?,?,?,?,?,1,?,?,?)`
    ).bind(id, username, name, email, team, role, await hashPassword(body.password),
           body.must_change_password === false ? 0 : 1, now(), admin.username).run();

    await logAudit(env, {
      area: "users", action: "user_created", target: username, changedBy: admin.username,
      detail: { role, team },
    });
    const created = await env.DB.prepare(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id=?`).bind(id).first();
    return json({ ok: true, user: created }, 201);
  }

  const one = path.match(/^\/admin\/api\/users\/([^/]+)$/);
  if (one && method === "PUT") {
    const id = one[1];
    const body = await request.json().catch(() => ({}));
    const target = await env.DB.prepare("SELECT * FROM users WHERE id=?").bind(id).first();
    if (!target) return json({ error: "No such user." }, 404);

    const name = String(body.name ?? target.name).trim() || target.name;
    const email = body.email === undefined ? target.email : (String(body.email).trim() || null);
    const team = String(body.team ?? target.team).trim() || target.team;
    const role = ROLES.includes(body.role) ? body.role : target.role;
    const active = body.active === undefined ? target.active : (body.active ? 1 : 0);

    // An admin who removes their own admin role, or switches themselves off,
    // locks themselves out of the only screen that could undo it.
    if (target.id === admin.id && (role !== "admin" || !active)) {
      return json({ error: "You can't remove your own admin access or turn off your own account." }, 400);
    }
    // Never let the last admin standing disappear.
    if (target.role === "admin" && (role !== "admin" || !active)) {
      const others = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM users WHERE role='admin' AND active=1 AND id<>?"
      ).bind(id).first();
      if ((others?.n ?? 0) === 0) {
        return json({ error: "That's the only active admin — promote someone else first." }, 400);
      }
    }

    await env.DB.prepare(
      "UPDATE users SET name=?, email=?, team=?, role=?, active=?, updated_at=?, updated_by=? WHERE id=?"
    ).bind(name, email, team, role, active, now(), admin.username, id).run();

    const changes = {};
    if (name !== target.name) changes.name = { from: target.name, to: name };
    if (team !== target.team) changes.team = { from: target.team, to: team };
    if (role !== target.role) changes.role = { from: target.role, to: role };
    if (active !== target.active) changes.active = { from: !!target.active, to: !!active };
    if (Object.keys(changes).length) {
      await logAudit(env, {
        area: "users", action: "user_updated", target: target.username,
        changedBy: admin.username, detail: changes,
      });
    }
    const updated = await env.DB.prepare(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id=?`).bind(id).first();
    return json({ ok: true, user: updated });
  }

  // Reset someone's password. The new one is shown to the admin once, here in
  // the response, and never stored anywhere readable.
  const reset = path.match(/^\/admin\/api\/users\/([^/]+)\/password$/);
  if (reset && method === "PUT") {
    const id = reset[1];
    const body = await request.json().catch(() => ({}));
    const target = await env.DB.prepare("SELECT id, username FROM users WHERE id=?").bind(id).first();
    if (!target) return json({ error: "No such user." }, 404);

    const problem = passwordProblem(body.password);
    if (problem) return json({ error: problem }, 400);

    await env.DB.prepare(
      "UPDATE users SET password_hash=?, must_change_password=?, updated_at=?, updated_by=? WHERE id=?"
    ).bind(await hashPassword(body.password),
           body.must_change_password === false ? 0 : 1, now(), admin.username, id).run();

    // The password itself is never in the audit detail.
    await logAudit(env, {
      area: "users", action: "password_reset", target: target.username, changedBy: admin.username,
    });
    return json({ ok: true });
  }

  if (one && method === "DELETE") {
    const id = one[1];
    const target = await env.DB.prepare("SELECT id, username, role FROM users WHERE id=?").bind(id).first();
    if (!target) return json({ error: "No such user." }, 404);
    if (target.id === admin.id) return json({ error: "You can't delete your own account." }, 400);
    if (target.role === "admin") {
      const others = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM users WHERE role='admin' AND active=1 AND id<>?"
      ).bind(id).first();
      if ((others?.n ?? 0) === 0) return json({ error: "That's the only active admin." }, 400);
    }
    await env.DB.prepare("DELETE FROM users WHERE id=?").bind(id).run();
    await logAudit(env, { area: "users", action: "user_deleted", target: target.username, changedBy: admin.username });
    return json({ ok: true });
  }

  if (path === "/admin/api/audit" && method === "GET") {
    const { results } = await env.DB.prepare(
      "SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 300"
    ).all();
    return json({ audit: results });
  }

  return null;
}
