// Feedback. Any signed-in user can submit; triage is admin-only.
// Shaped after the Polk portal's feedback system: identity always comes from
// the session and never the client, the page it was sent from is captured
// automatically, and a failed notification email never blocks the write — but
// its outcome is always recorded rather than silently swallowed.

import {
  json, esc, logAudit, uid, now,
  FEEDBACK_CATEGORIES, FEEDBACK_STATUSES,
} from "./shared.js";

const MAX_MESSAGE = 4000;

const categoryLabel = key =>
  (FEEDBACK_CATEGORIES.find(c => c.key === key) || {}).label || key;

const PAGE_LABELS = {
  "/": "Play designer",
  "/app": "Play designer",
  "/admin/feedback": "Feedback admin",
  "/admin/users": "Access & Roles",
};
const pageLabel = p => PAGE_LABELS[p] || (p && p.startsWith("/admin") ? "Admin" : "");

/* ── Notification email ───────────────────────────────────────────────────
   Returns a human-readable outcome string that gets stored on the row. It
   never throws: the caller has already saved the feedback by this point.   */
async function notify(env, fb) {
  const row = await env.DB.prepare("SELECT value FROM feedback_settings WHERE key='notify_emails'").first();
  const to = (row?.value || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!to.length) return "skipped: no recipients configured";
  if (!env.RESEND_API_KEY) return "skipped: RESEND_API_KEY not set";

  const label = pageLabel(fb.page_path);
  const where = label ? `${label} (${fb.page_path})` : (fb.page_path || "unknown");
  const html = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="100%" style="max-width:600px;margin:0 auto;font-family:Arial,Helvetica,sans-serif">
<tr><td style="background:#12233d;border-radius:10px 10px 0 0;padding:18px 26px">
<span style="font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#9fb4cd">Football Plays</span><br>
<span style="font-size:21px;font-weight:bold;color:#ffffff">New Feedback</span></td></tr>
<tr><td style="background:#ffffff;border:1px solid #e3e3e3;border-top:none;border-radius:0 0 10px 10px;padding:24px 26px">
<p style="font-size:19px;font-weight:bold;color:#1a1a1a;margin:0 0 2px">${esc(fb.submitter_name)}</p>
<p style="font-size:13.5px;color:#1f7a45;font-weight:bold;margin:0 0 18px">${esc(categoryLabel(fb.category))}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid #ececec">
<tr><td style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#8a8a8a;padding:9px 14px 9px 0;border-bottom:1px solid #ececec;white-space:nowrap;width:1%">From</td>
<td style="font-size:14px;color:#1a1a1a;padding:9px 0;border-bottom:1px solid #ececec">${esc(fb.submitter_email || "no email on file")}</td></tr>
<tr><td style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#8a8a8a;padding:9px 14px 9px 0;white-space:nowrap;width:1%">Page</td>
<td style="font-size:14px;color:#1a1a1a;padding:9px 0">${esc(where)}</td></tr></table>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:16px 0 20px"><tr>
<td style="background:#f4f7fa;border-radius:8px;padding:13px 16px">
<span style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#8a8a8a">Message</span><br>
<span style="font-size:14px;color:#333;line-height:1.55">${esc(fb.message).replace(/\n/g, "<br>")}</span>
</td></tr></table>
<p style="font-size:12px;color:#8a8a8a;margin:0">Sent automatically by the feedback form in Football Plays.</p>
</td></tr></table>`;

  const text = `NEW FEEDBACK — Football Plays

${fb.submitter_name}
${categoryLabel(fb.category)}

From: ${fb.submitter_email || "no email on file"}
Page: ${where}

Message:
${fb.message}
`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.FEEDBACK_FROM || "Football Plays <onboarding@resend.dev>",
        to,
        subject: `Feedback: ${categoryLabel(fb.category)}${label ? ` (${label})` : ""}`,
        html, text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return `error: Resend ${res.status}: ${body.slice(0, 200)}`;
    }
    return `sent to ${to.join(", ")}`;
  } catch (e) {
    return `error: ${e.message || "network error"}`;
  }
}

/* ── Anyone signed in ─────────────────────────────────────────────────── */
export async function handleFeedbackSubmit(request, env, user) {
  const body = await request.json().catch(() => ({}));
  const category = FEEDBACK_CATEGORIES.some(c => c.key === body.category) ? body.category : "other";
  const message = String(body.message || "").trim().slice(0, MAX_MESSAGE);
  if (!message) return json({ error: "Type a message before sending." }, 400);
  const pagePath = String(body.page_path || "").slice(0, 200) || null;

  const fb = {
    id: uid(), category, message, page_path: pagePath,
    // Always the verified session identity — never a name supplied by the page.
    submitter_name: user.name || user.username,
    submitter_email: user.email || null,
  };

  await env.DB.prepare(
    `INSERT INTO feedback (id, category, message, page_path, submitter_name, submitter_email, status, created_at)
     VALUES (?,?,?,?,?,?,'New',?)`
  ).bind(fb.id, fb.category, fb.message, fb.page_path, fb.submitter_name, fb.submitter_email, now()).run();

  const outcome = await notify(env, fb);
  await env.DB.prepare("UPDATE feedback SET notify_status=? WHERE id=?")
    .bind(outcome, fb.id).run().catch(() => {});

  return json({ ok: true });
}

/* ── Admin triage ─────────────────────────────────────────────────────── */
export async function handleFeedbackAdmin(request, env, path, method, admin) {

  if (path === "/admin/api/feedback" && method === "GET") {
    const { results: feedback } = await env.DB.prepare(
      "SELECT * FROM feedback ORDER BY created_at DESC").all();
    const { results: logs } = await env.DB.prepare(
      "SELECT * FROM feedback_log ORDER BY created_at ASC").all();
    return json({ feedback, logs, categories: FEEDBACK_CATEGORIES, statuses: FEEDBACK_STATUSES });
  }

  // Checked before the generic /:id route below — otherwise "settings" would
  // match as a feedback id.
  if (path === "/admin/api/feedback/settings" && method === "GET") {
    const row = await env.DB.prepare("SELECT value FROM feedback_settings WHERE key='notify_emails'").first();
    return json({ notify_emails: row?.value || "", email_enabled: !!env.RESEND_API_KEY });
  }

  if (path === "/admin/api/feedback/settings" && method === "PUT") {
    const body = await request.json().catch(() => ({}));
    const emails = String(body.notify_emails || "").trim().slice(0, 500);
    const prev = await env.DB.prepare("SELECT value FROM feedback_settings WHERE key='notify_emails'").first();
    await env.DB.prepare(
      `INSERT INTO feedback_settings (key, value, updated_by, updated_at) VALUES ('notify_emails',?,?,?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_by=excluded.updated_by, updated_at=excluded.updated_at`
    ).bind(emails, admin.username, now()).run();

    // Worth recording in full: quietly dropping an address here would silently
    // stop someone being told about new feedback.
    if ((prev?.value || "") !== emails) {
      await logAudit(env, {
        area: "feedback", action: "notify_emails_changed", target: "Feedback notifications",
        changedBy: admin.username, detail: { from: prev?.value || "", to: emails },
      });
    }
    return json({ ok: true, notify_emails: emails });
  }

  const note = path.match(/^\/admin\/api\/feedback\/([^/]+)\/note$/);
  if (note && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const text = String(body.note || "").trim().slice(0, 2000);
    if (!text) return json({ error: "The note is empty." }, 400);
    const exists = await env.DB.prepare("SELECT id FROM feedback WHERE id=?").bind(note[1]).first();
    if (!exists) return json({ error: "No such feedback." }, 404);

    const entry = { id: uid(), feedback_id: note[1], note: text, changed_by: admin.username, created_at: now() };
    await env.DB.prepare(
      "INSERT INTO feedback_log (id, feedback_id, note, changed_by, created_at) VALUES (?,?,?,?,?)"
    ).bind(entry.id, entry.feedback_id, entry.note, entry.changed_by, entry.created_at).run();
    return json({ ok: true, entry });
  }

  const one = path.match(/^\/admin\/api\/feedback\/([^/]+)$/);
  if (one && method === "PUT") {
    const body = await request.json().catch(() => ({}));
    if (!FEEDBACK_STATUSES.includes(body.status)) return json({ error: "That isn't a valid status." }, 400);
    const existing = await env.DB.prepare("SELECT id, status FROM feedback WHERE id=?").bind(one[1]).first();
    if (!existing) return json({ error: "No such feedback." }, 404);

    await env.DB.prepare("UPDATE feedback SET status=?, updated_by=?, updated_at=? WHERE id=?")
      .bind(body.status, admin.username, now(), one[1]).run();

    if (existing.status !== body.status) {
      await env.DB.prepare(
        "INSERT INTO feedback_log (id, feedback_id, old_status, new_status, changed_by, created_at) VALUES (?,?,?,?,?,?)"
      ).bind(uid(), one[1], existing.status, body.status, admin.username, now()).run().catch(() => {});
    }
    return json({ ok: true });
  }

  return null;
}
