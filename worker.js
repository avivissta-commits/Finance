/**
 * Cloudflare Worker — backend ל"הכסף שלי".
 *
 * מקור האמת לנתוני המשתמש: Cloudflare KV (namespace בשם HAKESEF).
 * ה-Worker גם מגיש את האפליקציה (index.html) מתיקיית ה-assets, וגם עונה ל-/api/*.
 *
 * מודל הנתונים ב-KV:
 *   key   = "u:" + sha256(syncId)         // מזהה משתמש מוצפן (לא שומרים את הקוד עצמו)
 *   value = JSON { schema, rev, updatedAt, data }   // מסמך יחיד לכל משתמש
 *
 * Endpoints:
 *   GET  /api/data      (header x-sync-id) -> { empty:true } | { schema, rev, updatedAt, data }
 *   PUT  /api/data      (header x-sync-id, body { schema, rev, updatedAt, data })
 *                       -> 200 { rev, updatedAt }  |  409 { ...serverCopy }  (אם בשרת יש גרסה חדשה יותר)
 *   GET  /api/health    -> { ok:true }
 *
 * מדיניות conflict: last-write-wins לפי updatedAt. אם ל-Worker יש updatedAt חדש יותר
 * מזה שנשלח — מוחזר 409 עם עותק השרת, והלקוח מאמץ אותו (ומראה טוסט "סונכרן ממכשיר אחר").
 */

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,PUT,OPTIONS",
  "access-control-allow-headers": "content-type,x-sync-id",
  "access-control-max-age": "86400",
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS },
  });
}

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function handleApi(request, env, url) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  if (url.pathname === "/api/health") return json({ ok: true, at: Date.now() });

  if (url.pathname !== "/api/data") return json({ error: "not found" }, 404);

  if (!env.HAKESEF) return json({ error: "KV namespace HAKESEF is not bound" }, 500);

  const syncId = request.headers.get("x-sync-id") || "";
  if (syncId.length < 6) return json({ error: "missing or too-short sync id" }, 400);
  const key = "u:" + (await sha256Hex(syncId));

  // ---- GET: משיכת הנתונים ----
  if (request.method === "GET") {
    const raw = await env.HAKESEF.get(key);
    if (!raw) return json({ empty: true });
    return new Response(raw, { headers: { "content-type": "application/json; charset=utf-8", ...CORS } });
  }

  // ---- PUT: שמירת הנתונים ----
  if (request.method === "PUT") {
    let body;
    try { body = await request.json(); } catch (_) { return json({ error: "invalid json" }, 400); }
    if (!body || typeof body !== "object" || typeof body.data !== "object" || body.data === null) {
      return json({ error: "body must be { schema, rev, updatedAt, data }" }, 400);
    }

    const incomingUpdated = +body.updatedAt || 0;
    const existingRaw = await env.HAKESEF.get(key);
    const existing = existingRaw ? JSON.parse(existingRaw) : null;

    // conflict: בשרת יש גרסה חדשה יותר -> דחייה + החזרת עותק השרת
    if (existing && (+existing.updatedAt || 0) > incomingUpdated) {
      return json(existing, 409);
    }

    const rev = Math.max((existing && +existing.rev) || 0, +body.rev || 0);
    const envelope = {
      schema: +body.schema || 1,
      rev,
      updatedAt: incomingUpdated || Date.now(),
      data: body.data,
    };
    await env.HAKESEF.put(key, JSON.stringify(envelope));
    return json({ rev: envelope.rev, updatedAt: envelope.updatedAt });
  }

  return json({ error: "method not allowed" }, 405);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // API
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, url);
      } catch (err) {
        return json({ error: "server error", detail: String(err && err.message || err) }, 500);
      }
    }

    // כל השאר -> הקבצים הסטטיים (האפליקציה). דורש binding בשם ASSETS ב-wrangler.toml.
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  },
};
