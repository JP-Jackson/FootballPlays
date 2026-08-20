// The playbook: custom plays and the team roster, both scoped to the signed-in
// user's team so a head coach and his assistants share one playbook.
// The 34 built-in plays ship inside the client and never touch the database.

import { json, uid, now } from "./shared.js";

const MAX_NAME = 80;
const MAX_DATA = 400_000;     // a very elaborate play is a few KB; this is a runaway guard

export async function handlePlays(request, env, path, method, user) {

  if (path === "/api/plays" && method === "GET") {
    const { results } = await env.DB.prepare(
      "SELECT * FROM plays WHERE team=? ORDER BY updated_at DESC, created_at DESC"
    ).bind(user.team).all();
    return json({ plays: results.map(rowToPlay) });
  }

  if (path === "/api/plays" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const problem = playProblem(body);
    if (problem) return json({ error: problem }, 400);

    const id = uid();
    const stamp = now();
    await env.DB.prepare(
      `INSERT INTO plays (id, team, name, side, n, form, note, data, created_at, created_by, updated_at, updated_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(id, user.team, String(body.name).trim().slice(0, MAX_NAME), body.side, body.n,
           body.form || null, (body.note || "").slice(0, 2000),
           JSON.stringify({ players: body.players, ball: body.ball ?? null }),
           stamp, user.username, stamp, user.username).run();

    const row = await env.DB.prepare("SELECT * FROM plays WHERE id=?").bind(id).first();
    return json({ ok: true, play: rowToPlay(row) }, 201);
  }

  const one = path.match(/^\/api\/plays\/([^/]+)$/);
  if (one && method === "PUT") {
    const id = one[1];
    const body = await request.json().catch(() => ({}));
    const problem = playProblem(body);
    if (problem) return json({ error: problem }, 400);

    // Team scoping is enforced in the WHERE clause, not just at read time, so
    // a guessed id from another team can't be written to.
    const existing = await env.DB.prepare("SELECT id FROM plays WHERE id=? AND team=?")
      .bind(id, user.team).first();
    if (!existing) return json({ error: "That play isn't in your playbook." }, 404);

    await env.DB.prepare(
      "UPDATE plays SET name=?, side=?, n=?, form=?, note=?, data=?, updated_at=?, updated_by=? WHERE id=? AND team=?"
    ).bind(String(body.name).trim().slice(0, MAX_NAME), body.side, body.n, body.form || null,
           (body.note || "").slice(0, 2000),
           JSON.stringify({ players: body.players, ball: body.ball ?? null }),
           now(), user.username, id, user.team).run();

    const row = await env.DB.prepare("SELECT * FROM plays WHERE id=?").bind(id).first();
    return json({ ok: true, play: rowToPlay(row) });
  }

  if (one && method === "DELETE") {
    const res = await env.DB.prepare("DELETE FROM plays WHERE id=? AND team=?")
      .bind(one[1], user.team).run();
    if (!res.meta?.changes) return json({ error: "That play isn't in your playbook." }, 404);
    return json({ ok: true });
  }

  /* ── Roster ──────────────────────────────────────────────────────────── */
  if (path === "/api/roster" && method === "GET") {
    const { results } = await env.DB.prepare(
      "SELECT id, num, name, sort FROM roster WHERE team=? ORDER BY sort, rowid"
    ).bind(user.team).all();
    return json({ roster: results });
  }

  // The roster is small and always edited as a whole list, so replacing it in
  // one transaction is simpler and more predictable than per-row patching.
  if (path === "/api/roster" && method === "PUT") {
    const body = await request.json().catch(() => ({}));
    if (!Array.isArray(body.roster)) return json({ error: "Expected a roster list." }, 400);
    if (body.roster.length > 120) return json({ error: "That's more players than a roster holds." }, 400);

    const stamp = now();
    const statements = [env.DB.prepare("DELETE FROM roster WHERE team=?").bind(user.team)];
    body.roster.forEach((r, i) => {
      statements.push(env.DB.prepare(
        "INSERT INTO roster (id, team, num, name, sort, created_at, updated_at) VALUES (?,?,?,?,?,?,?)"
      ).bind(uid(), user.team, String(r.num ?? "").slice(0, 4),
             String(r.name ?? "").slice(0, 60), i, stamp, stamp));
    });
    await env.DB.batch(statements);

    const { results } = await env.DB.prepare(
      "SELECT id, num, name, sort FROM roster WHERE team=? ORDER BY sort, rowid"
    ).bind(user.team).all();
    return json({ ok: true, roster: results });
  }

  return null;
}

function playProblem(b) {
  if (!b || typeof b !== "object") return "Nothing to save.";
  if (!String(b.name || "").trim()) return "Give the play a name.";
  if (b.side !== "offense" && b.side !== "defense") return "A play is either offense or defense.";
  const n = Number(b.n);
  if (!Number.isInteger(n) || n < 5 || n > 11) return "Team size has to be between 5 and 11.";
  if (!Array.isArray(b.players) || !b.players.length) return "A play needs players on the field.";
  if (JSON.stringify({ players: b.players, ball: b.ball ?? null }).length > MAX_DATA) {
    return "That play is too big to save.";
  }
  return null;
}

function rowToPlay(row) {
  let data = {};
  try { data = JSON.parse(row.data); } catch { data = { players: [], ball: null }; }
  return {
    id: row.id, name: row.name, side: row.side, n: row.n, form: row.form,
    note: row.note || "", players: data.players || [], ball: data.ball ?? null,
    custom: true, family: "My plays",
    created_by: row.created_by, updated_by: row.updated_by, updated_at: row.updated_at,
  };
}
