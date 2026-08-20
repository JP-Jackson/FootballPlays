// Shared helpers for every route: responses, escaping, password hashing,
// session cookies and the audit trail.

export const ROLES = ["admin", "coach"];

export const FEEDBACK_CATEGORIES = [
  { key: "bug",   label: "Bug / Problem" },
  { key: "idea",  label: "Idea / Suggestion" },
  { key: "other", label: "Other" },
];

export const FEEDBACK_STATUSES = ["New", "Investigating", "In Progress", "Resolved", "Not Planned"];

export const SESSION_COOKIE = "fp_session";
export const SESSION_MS = 30 * 24 * 60 * 60 * 1000;   // 30 days — a season runs long

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function parseCookies(header) {
  const out = {};
  (header || "").split(";").forEach(c => {
    const eq = c.indexOf("=");
    if (eq > 0) out[c.slice(0, eq).trim()] = c.slice(eq + 1).trim();
  });
  return out;
}

/* ── base64url, so a cookie value never needs escaping ─────────────────── */
const b64u = {
  encode(bytes) {
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  decode(str) {
    const pad = str.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(pad + "=".repeat((4 - pad.length % 4) % 4));
    return Uint8Array.from(bin, c => c.charCodeAt(0));
  },
};

/* ── Passwords: PBKDF2-SHA256 ──────────────────────────────────────────────
   Stored as pbkdf2$<iterations>$<salt>$<hash>. Verification always runs the
   full derivation and compares in constant time, so a wrong password costs
   the same as a right one and reveals nothing by timing.                    */
const PBKDF2_ITERATIONS = 210000;

export async function hashPassword(password, iterations = PBKDF2_ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await deriveBits(password, salt, iterations);
  return `pbkdf2$${iterations}$${b64u.encode(salt)}$${b64u.encode(bits)}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [scheme, iterStr, saltStr, hashStr] = String(stored || "").split("$");
    if (scheme !== "pbkdf2") return false;
    const iterations = parseInt(iterStr, 10);
    if (!Number.isFinite(iterations) || iterations < 1000) return false;
    const bits = await deriveBits(password, b64u.decode(saltStr), iterations);
    return timingSafeEqual(bits, b64u.decode(hashStr));
  } catch { return false; }
}

async function deriveBits(password, salt, iterations) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256);
  return new Uint8Array(bits);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/* ── Sessions: a signed, expiring cookie. No server-side session table ──── */
async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function sign(secret, value) {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(value));
  return b64u.encode(new Uint8Array(sig));
}

export async function makeSession(env, user) {
  const payload = b64u.encode(new TextEncoder().encode(JSON.stringify({
    uid: user.id, exp: Date.now() + SESSION_MS,
  })));
  return `${payload}.${await sign(sessionSecret(env), payload)}`;
}

/** Returns the live user row, or null. Re-reads the user every request so a
 *  deactivated account or a changed role takes effect immediately rather than
 *  lingering until the cookie expires. */
export async function readSession(env, cookieValue) {
  try {
    const dot = String(cookieValue || "").indexOf(".");
    if (dot < 1) return null;
    const payload = cookieValue.slice(0, dot);
    const sig = cookieValue.slice(dot + 1);
    const expected = await sign(sessionSecret(env), payload);
    if (!timingSafeEqual(new TextEncoder().encode(sig), new TextEncoder().encode(expected))) return null;

    const claims = JSON.parse(new TextDecoder().decode(b64u.decode(payload)));
    if (!claims.exp || Date.now() > claims.exp) return null;

    const user = await env.DB.prepare(
      "SELECT id, username, name, email, team, role, active, must_change_password FROM users WHERE id=?"
    ).bind(claims.uid).first();
    if (!user || !user.active) return null;
    return user;
  } catch { return null; }
}

function sessionSecret(env) {
  const s = env.SESSION_SECRET;
  // Refusing to start without a secret beats silently signing every cookie
  // with a default that anyone reading this repo could forge.
  if (!s || s.length < 16) {
    throw new Error("SESSION_SECRET is missing or too short. Set it with: npx wrangler secret put SESSION_SECRET");
  }
  return s;
}

export function sessionCookie(value, maxAgeMs) {
  const parts = [
    `${SESSION_COOKIE}=${value}`,
    "Path=/", "HttpOnly", "Secure", "SameSite=Lax",
    `Max-Age=${Math.floor((maxAgeMs ?? SESSION_MS) / 1000)}`,
  ];
  return parts.join("; ");
}

export const clearedCookie = () => `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

/* ── Audit trail ───────────────────────────────────────────────────────── */
export async function logAudit(env, { area, action, target, changedBy, detail }) {
  await env.DB.prepare(
    "INSERT INTO audit_log (id, area, action, target, changed_by, detail, created_at) VALUES (?,?,?,?,?,?,?)"
  ).bind(
    crypto.randomUUID(), area, action, target || null, changedBy || null,
    detail ? JSON.stringify(detail) : null, new Date().toISOString()
  ).run().catch(() => {});   // best-effort: never block the real action
}

export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
