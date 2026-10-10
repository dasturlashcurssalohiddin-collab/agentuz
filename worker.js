// Cloudflare Workers'ga qo'yiladi (GitHub'ga emas).
// Settings > Variables and Secrets:
//   Secret:  GROQ_API_KEY, TELEGRAM_BOT_TOKEN, FB_PRIVATE_KEY
//   Oddiy:   GROQ_MODEL, ALLOWED_ORIGIN (https://nom.github.io), FB_PROJECT_ID, FB_CLIENT_EMAIL,
//            FB_API_KEY (Web API key), ADMIN_TELEGRAM_IDS (vergul bilan, masalan 12345,67890)
// KV namespace yarating va "USAGE" nomi bilan ulang (token sarfi shu yerda saqlanadi).

const te = new TextEncoder();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
const b64url = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function verifyTelegram(tg, botToken) {
  if (!tg || !tg.hash || !tg.id) return false;
  const { hash, ...rest } = tg;
  const check = Object.keys(rest).sort().map(k => `${k}=${rest[k]}`).join("\n");
  const secret = await crypto.subtle.digest("SHA-256", te.encode(botToken));
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = hex(await crypto.subtle.sign("HMAC", key, te.encode(check)));
  return sig === hash && Date.now() / 1000 - Number(tg.auth_date) < 86400;
}

// Firebase custom token (RS256 JWT)
async function mintFirebaseToken(env, uid, claims) {
  const now = Math.floor(Date.now() / 1000);
  const enc = o => b64url(te.encode(JSON.stringify(o)));
  const data = enc({ alg: "RS256", typ: "JWT" }) + "." + enc({
    iss: env.FB_CLIENT_EMAIL, sub: env.FB_CLIENT_EMAIL,
    aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
    iat: now, exp: now + 3600, uid, claims,
  });
  const pem = env.FB_PRIVATE_KEY.replace(/\\n/g, "\n").replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  return data + "." + b64url(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, te.encode(data)));
}

// Firebase ID token ni Google orqali tekshirish
async function uidFromIdToken(env, idToken) {
  if (!idToken) return null;
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FB_API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }),
  });
  if (!r.ok) return null;
  return (await r.json()).users?.[0]?.localId ?? null;
}

// Agentni Firestore'dan o'qish (agents kolleksiyasi ochiq o'qiladi)
async function getAgent(env, id) {
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${env.FB_PROJECT_ID}/databases/(default)/documents/agents/${encodeURIComponent(id)}`);
  if (!r.ok) return null;
  const f = (await r.json()).fields || {};
  return {
    systemPrompt: f.systemPrompt?.stringValue || "",
    tokenLimit: Number(f.tokenLimit?.integerValue ?? f.tokenLimit?.doubleValue ?? 40000),
  };
}

export default {
  async fetch(req, env) {
    const cors = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    };
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method !== "POST") return json({ error: "Topilmadi" }, 404);

    let body;
    try { body = await req.json(); } catch { return json({ error: "Noto'g'ri so'rov" }, 400); }
    const path = new URL(req.url).pathname;

    // 1) Telegram -> Firebase token
    if (path === "/auth") {
      const { telegram, name } = body;
      if (!(await verifyTelegram(telegram, env.TELEGRAM_BOT_TOKEN))) return json({ error: "Telegram tasdiqlanmadi" }, 401);
      const admins = (env.ADMIN_TELEGRAM_IDS || "").split(",").map(s => s.trim());
      const claims = { name: String(name || telegram.first_name).slice(0, 60) };
      if (admins.includes(String(telegram.id))) claims.admin = true;
      return json({ token: await mintFirebaseToken(env, `tg_${telegram.id}`, claims) });
    }

    // 2) Qolganlari uchun Firebase ID token kerak
    const uid = await uidFromIdToken(env, body.idToken);
    if (!uid) return json({ error: "Qaytadan kiring" }, 401);

    const agent = await getAgent(env, String(body.agentId || ""));
    if (!agent) return json({ error: "Agent topilmadi" }, 404);
    const limit = agent.tokenLimit;
    const key = `u:${uid}:${body.agentId}`;
    const used = parseInt((await env.USAGE.get(key)) || "0", 10);

    if (path === "/usage") return json({ used, limit });

    if (path === "/chat") {
      if (used >= limit) return json({ error: "Bu agentning API limiti tugadi", used, limit }, 429);
      const messages = body.messages;
      if (!Array.isArray(messages) || !messages.length) return json({ error: "Xabar bo'sh" }, 400);
      const history = messages.slice(-20).map(m => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content).slice(0, 8000),
      }));
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.GROQ_API_KEY}` },
        body: JSON.stringify({ model: env.GROQ_MODEL || "llama-3.3-70b-versatile", messages: [{ role: "system", content: agent.systemPrompt }, ...history] }),
      });
      if (r.status === 429) return json({ error: "Groq limiti vaqtincha tugadi. Birozdan keyin urinib ko'ring.", used, limit }, 429);
      if (!r.ok) return json({ error: "Agent javob bera olmadi", used, limit }, 502);
      const d = await r.json();
      const spent = d.usage?.total_tokens || 0;
      await env.USAGE.put(key, String(used + spent));
      return json({ reply: d.choices?.[0]?.message?.content || "", used: used + spent, limit });
    }
    return json({ error: "Topilmadi" }, 404);
  },
};
