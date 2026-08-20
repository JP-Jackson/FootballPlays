// The game log, and what it adds up to.
// Everything here is team-scoped in the WHERE clause, the same as plays and
// roster, so one team can never read or write another's season.

import { json, uid, now } from "./shared.js";

const MAX_NAME = 80;

/** Averages, counts and last-run dates per play, computed in SQL rather than
 *  hauling every log row to the client. Everything the insight views need. */
async function insights(env, team) {
  const { results: perPlay } = await env.DB.prepare(`
    SELECT l.play_id, MAX(l.play_name) AS play_name,
           COUNT(DISTINCT l.game_id) AS games,
           SUM(l.times_run)          AS times_run,
           AVG(l.rating)             AS avg_rating,
           COUNT(l.rating)           AS rated,
           MAX(g.played_on)          AS last_run
      FROM play_logs l JOIN games g ON g.id = l.game_id
     WHERE l.team = ?
     GROUP BY l.play_id
     ORDER BY avg_rating IS NULL, avg_rating DESC`
  ).bind(team).all();

  const { results: perOpponent } = await env.DB.prepare(`
    SELECT g.opponent, COUNT(DISTINCT g.id) AS games, MAX(g.played_on) AS last_played,
           AVG(l.rating) AS avg_rating
      FROM games g LEFT JOIN play_logs l ON l.game_id = g.id
     WHERE g.team = ?
     GROUP BY g.opponent
     ORDER BY last_played DESC`
  ).bind(team).all();

  return { perPlay, perOpponent };
}

export async function handleHistory(request, env, path, method, user) {

  /* ── Games ─────────────────────────────────────────────────────────── */
  if (path === "/api/games" && method === "GET") {
    const { results } = await env.DB.prepare(`
      SELECT g.*, COUNT(l.id) AS plays_logged, AVG(l.rating) AS avg_rating
        FROM games g LEFT JOIN play_logs l ON l.game_id = g.id
       WHERE g.team = ?
       GROUP BY g.id
       ORDER BY g.played_on DESC, g.created_at DESC`
    ).bind(user.team).all();
    return json({ games: results });
  }

  if (path === "/api/games" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const problem = gameProblem(body);
    if (problem) return json({ error: problem }, 400);

    const id = uid(), stamp = now();
    await env.DB.prepare(
      `INSERT INTO games (id, team, opponent, played_on, result, notes, created_at, created_by, updated_at, updated_by)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).bind(id, user.team, String(body.opponent).trim().slice(0, MAX_NAME),
           body.played_on, (body.result || "").slice(0, 40),
           (body.notes || "").slice(0, 2000), stamp, user.username, stamp, user.username).run();

    const row = await env.DB.prepare("SELECT * FROM games WHERE id=?").bind(id).first();
    return json({ ok: true, game: row }, 201);
  }

  const one = path.match(/^\/api\/games\/([^/]+)$/);
  if (one && method === "GET") {
    const game = await env.DB.prepare("SELECT * FROM games WHERE id=? AND team=?")
      .bind(one[1], user.team).first();
    if (!game) return json({ error: "No such game." }, 404);
    const { results: logs } = await env.DB.prepare(
      "SELECT * FROM play_logs WHERE game_id=? ORDER BY created_at"
    ).bind(one[1]).all();
    return json({ game, logs });
  }

  if (one && method === "PUT") {
    const body = await request.json().catch(() => ({}));
    const problem = gameProblem(body);
    if (problem) return json({ error: problem }, 400);
    const res = await env.DB.prepare(
      "UPDATE games SET opponent=?, played_on=?, result=?, notes=?, updated_at=?, updated_by=? WHERE id=? AND team=?"
    ).bind(String(body.opponent).trim().slice(0, MAX_NAME), body.played_on,
           (body.result || "").slice(0, 40), (body.notes || "").slice(0, 2000),
           now(), user.username, one[1], user.team).run();
    if (!res.meta?.changes) return json({ error: "No such game." }, 404);
    const row = await env.DB.prepare("SELECT * FROM games WHERE id=?").bind(one[1]).first();
    return json({ ok: true, game: row });
  }

  if (one && method === "DELETE") {
    const game = await env.DB.prepare("SELECT id FROM games WHERE id=? AND team=?")
      .bind(one[1], user.team).first();
    if (!game) return json({ error: "No such game." }, 404);
    // D1 has no cascade here, so the logs go with it explicitly.
    await env.DB.batch([
      env.DB.prepare("DELETE FROM play_logs WHERE game_id=?").bind(one[1]),
      env.DB.prepare("DELETE FROM games WHERE id=? AND team=?").bind(one[1], user.team),
    ]);
    return json({ ok: true });
  }

  /* ── One play in one game ──────────────────────────────────────────── */
  const logs = path.match(/^\/api\/games\/([^/]+)\/logs$/);
  if (logs && method === "POST") {
    const gameId = logs[1];
    const game = await env.DB.prepare("SELECT id FROM games WHERE id=? AND team=?")
      .bind(gameId, user.team).first();
    if (!game) return json({ error: "No such game." }, 404);

    const body = await request.json().catch(() => ({}));
    const playId = String(body.play_id || "").trim();
    const playName = String(body.play_name || "").trim();
    if (!playId || !playName) return json({ error: "Pick a play." }, 400);

    const rating = body.rating == null || body.rating === "" ? null : Number(body.rating);
    if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
      return json({ error: "A rating is 1 to 5 stars." }, 400);
    }
    const times = Math.max(1, Math.min(99, parseInt(body.times_run, 10) || 1));

    // Logging the same play twice in one game means correcting the first
    // entry, not adding a second — hence the unique index on (game, play).
    const stamp = now();
    await env.DB.prepare(
      `INSERT INTO play_logs (id, game_id, team, play_id, play_name, times_run, rating, note, created_at, created_by, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(game_id, play_id) DO UPDATE SET
         play_name=excluded.play_name, times_run=excluded.times_run,
         rating=excluded.rating, note=excluded.note, updated_at=excluded.updated_at`
    ).bind(uid(), gameId, user.team, playId, playName.slice(0, MAX_NAME), times, rating,
           (body.note || "").slice(0, 500), stamp, user.username, stamp).run();

    const row = await env.DB.prepare("SELECT * FROM play_logs WHERE game_id=? AND play_id=?")
      .bind(gameId, playId).first();
    return json({ ok: true, log: row }, 201);
  }

  const oneLog = path.match(/^\/api\/logs\/([^/]+)$/);
  if (oneLog && method === "DELETE") {
    const res = await env.DB.prepare("DELETE FROM play_logs WHERE id=? AND team=?")
      .bind(oneLog[1], user.team).run();
    if (!res.meta?.changes) return json({ error: "No such entry." }, 404);
    return json({ ok: true });
  }

  /* ── What it all adds up to ────────────────────────────────────────── */
  if (path === "/api/insights" && method === "GET") {
    return json(await insights(env, user.team));
  }

  return null;
}

function gameProblem(b) {
  if (!b || typeof b !== "object") return "Nothing to save.";
  if (!String(b.opponent || "").trim()) return "Who did you play?";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.played_on || ""))) return "Pick a date for the game.";
  return null;
}
