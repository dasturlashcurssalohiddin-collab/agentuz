// Vercel serverless funksiya. Barcha maxfiy qiymatlar Vercel > Settings > Environment Variables'da turadi.
// Yo'llar: POST /api/auth, /api/chat, /api/usage
const crypto = require("crypto");
const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

function app() {
  if (getApps().length) return getApps()[0];
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    }),
  });
}

// Telegram Login Widget ma'lumotini tekshirish
function verifyTelegram(tg) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !tg || !tg.hash || !tg.id) return false;
  const { hash, ...rest } = tg;
  const check = Object.keys(rest).sort().map((k) => `${k}=${rest[k]}`).join("\n");
  const secret = crypto.createHash("sha256").update(token).digest();
  const calc = crypto.createHmac("sha256", secret).update(check).digest("hex");
  const a = Buffer.from(calc), b = Buffer.from(String(hash));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  return Date.now() / 1000 - Number(tg.auth_date) < 86400;
}

module.exports = async (req, res) => {
  // Sayt boshqa domenda bo'lsagina kerak (ALLOWED_ORIGIN). Bir domenda CORS shart emas.
  if (process.env.ALLOWED_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN);
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  }
  if (req.method === "OPTIONS") return res.status(204).end();
  const send = (status, obj) => res.status(status).json(obj);
  if (req.method !== "POST") return send(404, { error: "Topilmadi" });

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const path = (req.url || "").split("?")[0].replace(/^\/api/, "");

  try {
    // 1) Telegram -> Firebase token
    if (path === "/auth") {
      const { telegram, name } = body;
      if (!verifyTelegram(telegram)) return send(401, { error: "Telegram tasdiqlanmadi" });
      const admins = (process.env.ADMIN_TELEGRAM_IDS || "").split(",").map((s) => s.trim());
      const claims = { name: String(name || telegram.first_name || "").slice(0, 60) };
      if (admins.includes(String(telegram.id))) claims.admin = true;
      const token = await getAuth(app()).createCustomToken(`tg_${telegram.id}`, claims);
      return send(200, { token });
    }

    // 2) Qolganlari uchun Firebase ID token kerak
    let uid;
    try { uid = (await getAuth(app()).verifyIdToken(String(body.idToken || ""))).uid; }
    catch { return send(401, { error: "Qaytadan kiring" }); }

    const db = getFirestore(app());
    const agentId = String(body.agentId || "");
    if (!agentId || agentId.includes("/")) return send(404, { error: "Agent topilmadi" });
    const agentSnap = await db.collection("agents").doc(agentId).get();
    if (!agentSnap.exists) return send(404, { error: "Agent topilmadi" });
    const agent = agentSnap.data();
    const limit = Number(agent.tokenLimit || 40000);
    const usageRef = db.collection("usage").doc(`${uid}_${agentId}`);
    const used = (await usageRef.get()).data()?.tokens || 0;

    if (path === "/usage") return send(200, { used, limit });

    if (path === "/chat") {
      if (used >= limit) return send(429, { error: "Bu agentning API limiti tugadi", used, limit });
      const messages = body.messages;
      if (!Array.isArray(messages) || !messages.length) return send(400, { error: "Xabar bo'sh" });
      const history = messages.slice(-20).map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content).slice(0, 8000),
      }));
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
          messages: [{ role: "system", content: String(agent.systemPrompt || "") }, ...history],
        }),
      });
      if (r.status === 429) return send(429, { error: "Groq limiti vaqtincha tugadi. Birozdan keyin urinib ko'ring.", used, limit });
      if (!r.ok) return send(502, { error: "Agent javob bera olmadi", used, limit });
      const d = await r.json();
      const spent = d.usage?.total_tokens || 0;
      await usageRef.set({ tokens: FieldValue.increment(spent) }, { merge: true });
      return send(200, { reply: d.choices?.[0]?.message?.content || "", used: used + spent, limit });
    }
    return send(404, { error: "Topilmadi" });
  } catch (e) {
    console.error(e);
    return send(500, { error: "Server xatosi" });
  }
};
module.exports._verifyTelegram = verifyTelegram;
