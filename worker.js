// Cloudflare Workers'ga qo'yiladi (GitHub'ga emas).
// Dashboard > Workers > Create > shu kodni joylang.
// Settings > Variables and Secrets:
//   GROQ_API_KEY (Secret), TELEGRAM_BOT_TOKEN (Secret),
//   GROQ_MODEL (masalan llama-3.3-70b-versatile), ALLOWED_ORIGIN (masalan https://nom.github.io),
//   TOKEN_LIMIT (masalan 40000)
// Ixtiyoriy: KV namespace yarating va "USAGE" nomi bilan ulang (sarf limiti uchun).

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");

async function verifyTelegram(tg, botToken) {
  if (!tg || !tg.hash || !tg.id) return false;
  const { hash, ...rest } = tg;
  const check = Object.keys(rest).sort().map(k => `${k}=${rest[k]}`).join("\n");
  const enc = new TextEncoder();
  const secret = await crypto.subtle.digest("SHA-256", enc.encode(botToken));
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = hex(await crypto.subtle.sign("HMAC", key, enc.encode(check)));
  if (sig !== hash) return false;
  return Date.now() / 1000 - Number(tg.auth_date) < 86400 * 7;
}

export default {
  async fetch(req, env) {
    const cors = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    };
    const json = (o, status = 200) =>
      new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method !== "POST") return json({ error: "Topilmadi" }, 404);

    let body;
    try { body = await req.json(); } catch { return json({ error: "Noto'g'ri so'rov" }, 400); }
    const { telegram, agentId, system, messages } = body;

    if (!(await verifyTelegram(telegram, env.TELEGRAM_BOT_TOKEN)))
      return json({ error: "Telegram orqali kiring" }, 401);
    if (!Array.isArray(messages) || !messages.length) return json({ error: "Xabar bo'sh" }, 400);

    const limit = Number(env.TOKEN_LIMIT || 40000);
    const key = `u:${telegram.id}:${String(agentId).slice(0, 40)}`;
    let used = 0;
    if (env.USAGE) {
      used = parseInt((await env.USAGE.get(key)) || "0", 10);
      if (used >= limit) return json({ error: "Bu agentning API limiti tugadi", used, limit }, 429);
    }

    const history = messages.slice(-20).map(m => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content).slice(0, 8000),
    }));

    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: env.GROQ_MODEL || "llama-3.3-70b-versatile",
        messages: [{ role: "system", content: String(system || "").slice(0, 2000) }, ...history],
      }),
    });
    if (r.status === 429) return json({ error: "Groq limiti vaqtincha tugadi. Birozdan keyin urinib ko'ring." }, 429);
    if (!r.ok) return json({ error: "Agent javob bera olmadi" }, 502);

    const d = await r.json();
    const spent = d.usage?.total_tokens || 0;
    if (env.USAGE) await env.USAGE.put(key, String(used + spent));
    return json({ reply: d.choices?.[0]?.message?.content || "", used: used + spent, limit });
  },
};
