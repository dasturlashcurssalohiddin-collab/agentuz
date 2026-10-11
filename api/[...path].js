// Vercel serverless funksiya. Barcha maxfiy qiymatlar Vercel > Settings > Environment Variables'da turadi.
// Yo'llar: POST /api/auth, /api/chat, /api/usage; GET /api/status
const crypto = require("crypto");
const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

// Firestore'da agent bo'lmasa, shu tayyor agentlar ishlatiladi
const BUILTIN_AGENTS = {"xato": {"systemPrompt": "Sen xato topuvchi mutaxassisisan. Foydalanuvchi bergan HAR QANDAY matnni tekshir: dasturlash kodi, email, chat xabari, hujjat, xato xabari (log) va boshqalar. Avval bu nima ekanini aniqla. Keyin faqat topilgan xatolarni ro'yxat qil: qayeri (qator yoki iboraga ishora), nima xato va nega. So'ng tuzatilgan variantni ber. Kodda ishlamaydigan joylarni ham, mantiqiy xatolarni ham ko'rsat. Xato bo'lmasa, \"xato topilmadi\" de va to'qima. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "openai/gpt-oss-120b", "tokenLimit": 40000}, "imlo": {"systemPrompt": "Sen korrektorsan. Matn qaysi tilda bo'lsa (o'zbek, rus, ingliz, nemis va boshqalar), tilni o'zing aniqla va xatolarni o'sha til qoidasi bo'yicha top: imlo, tinish belgilari, grammatika, uslub. Matn ovozdan yozilgan bo'lishi mumkin (tinish belgilari kam bo'ladi), shunga e'tibor ber. Avval tuzatilgan matnni ber, keyin har bir xatoni ro'yxat qil: noto'g'ri → to'g'ri, qisqa sababi. Xato bo'lmasa, shuni ayt. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "openai/gpt-oss-20b", "tokenLimit": 40000}, "excel": {"systemPrompt": "Sen Excel mutaxassisisan. Vazifaga qarab formula, jadval yoki diagramma ber. Fayl kerak bo'lsa, javobingning oxirida [[EXCEL]]JSON[[/EXCEL]] blokini yoz, sayt undan .xlsx fayl va diagramma yaratadi. JSON formati: {\"nom\":\"fayl_nomi\",\"sheets\":[{\"name\":\"Varaq1\",\"rows\":[[\"Sarlavha1\",\"Sarlavha2\"],[\"a\",1],[\"Jami\",\"=SUM(B2:B10)\"]]}],\"chart\":{\"type\":\"bar\",\"title\":\"Sarlavha\",\"labels\":[\"a\",\"b\"],\"values\":[1,2]}}. Formulalar \"=\" bilan boshlanadi. \"chart\" faqat diagramma kerak bo'lsa, type: bar, line yoki pie. Katakda faqat matn yoki raqam bo'lsin. JSON to'g'ri bo'lsin: izohsiz va ``` belgilarsiz. Blokdan tashqarida qisqa tushuntir. Video yoki rasm yarata olmaysan, so'ralsa shuni ayt. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "openai/gpt-oss-120b", "tokenLimit": 40000}, "marketing": {"systemPrompt": "Sen marketing mutaxassisisan. Kichik biznes uchun qisqa, aniq va sotadigan matnlar yoz. Instagram va Telegram uchun moslashtir. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "openai/gpt-oss-20b", "tokenLimit": 40000}, "reklama": {"systemPrompt": "Sen kopirayter. Mahsulot uchun 5 ta turli uslubdagi qisqa reklama matni va slogan ber. Haqiqatga to'g'ri kelmaydigan va'dalar yozma. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "openai/gpt-oss-20b", "tokenLimit": 40000}, "telegram-post": {"systemPrompt": "Sen Telegram kanal muharririsan. Kanal mavzusiga mos post rejasi va tayyor matnlar yoz. Matnlar qisqa va qiziqarli bo'lsin. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "openai/gpt-oss-120b", "tokenLimit": 40000}, "instagram": {"systemPrompt": "Sen ijtimoiy tarmoq kontent menejerisan. Post g'oyalari, sarlavha, qisqa matn va mos xeshteglar ber. Haftalik kontent jadvali ham tuz. Instagramga o'zing joylay olmaysan: tayyor matnni foydalanuvchi o'zi joylaydi, so'ralsa shuni ayt. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "openai/gpt-oss-20b", "tokenLimit": 40000}, "yozuvchi": {"systemPrompt": "Sen matn yozuvchisan. So'ralgan matnni toza, rasmiy yoki do'stona uslubda yoz. Kerak bo'lsa avval bitta aniqlashtiruvchi savol ber. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "openai/gpt-oss-20b", "tokenLimit": 40000}, "hikoya": {"systemPrompt": "Sen ijodkor yozuvchisan. So'ralgan mavzuda qiziqarli hikoya, ssenariy yoki g'oyalar yoz. Mavjud mashhur asarlardan matn ko'chirma. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "qwen/qwen3.8-27b", "tokenLimit": 40000}};

// Har agent uchun vazifadan oldin so'raladigan ma'lumotlar: [kalit, nima so'raladi].
// Ro'yxatda yo'q agent DEFAULT_NEEDS ni ishlatadi. Bir marta berilgan javob Firestore'da saqlanadi va qayta so'ralmaydi.
const DEFAULT_NEEDS = [["maqsad", "vazifaning maqsadi"], ["tafsilot", "vazifaga oid asosiy tafsilotlar"]];
const NEEDS = {
  "telegram-post": [
    ["mavzu", "kanal mavzusi"],
    ["auditoriya", "kanalni kimlar o'qiydi"],
    ["uslub", "post uslubi (rasmiy, do'stona, hazilli)"],
    ["hajm", "nechta post va qaysi davrga (masalan, 1 haftaga 7 ta)"]
  ],
  "instagram": [["akkaunt", "akkaunt mavzusi"], ["auditoriya", "auditoriya"], ["uslub", "post uslubi"], ["hajm", "haftada nechta post"]],
  "marketing": [["biznes", "biznes turi"], ["mahsulot", "mahsulot yoki xizmat"], ["mijoz", "kimga sotiladi"], ["platforma", "qaysi platforma"]],
  "yozuvchi": [["tur", "matn turi (xat, maqola...)"], ["kimga", "kimga yoziladi"], ["uslub", "uslub"], ["hajm", "taxminiy hajm"]],
  "reklama": [["mahsulot", "qaysi mahsulot yoki xizmat"], ["mijoz", "maqsadli mijoz"], ["platforma", "qayerda joylanadi"]],
  "xato": [],
  "imlo": [],
  "excel": [],
  "hikoya": [["janr", "janr (hikoya, she'r, ssenariy)"], ["mavzu", "mavzu yoki g'oya"]],
};

// Kanalga avtomatik yuborish mumkin bo'lgan agentlar
const TG_AGENTS = new Set(["telegram-post", "instagram", "marketing", "reklama", "yozuvchi", "hikoya"]);

// Kalit qanday joylangan bo'lmasin (\n belgilari, bo'sh joylar, qo'shtirnoq, bitta qator) to'g'ri PEM'ga keltiriladi
function normalizePem(raw) {
  const body = String(raw || "")
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "")
    .replace(/-----END [A-Z ]*PRIVATE KEY-----/, "")
    .replace(/[^A-Za-z0-9+\/=]/g, "");
  if (!body) return "";
  return `-----BEGIN PRIVATE KEY-----\n${body.match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----\n`;
}

function app() {
  if (getApps().length) return getApps()[0];
  let projectId = process.env.FIREBASE_PROJECT_ID;
  let clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  // Oson variant: butun service account JSON bitta o'zgaruvchida (FIREBASE_SERVICE_ACCOUNT)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const j = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      projectId = j.project_id;
      clientEmail = j.client_email;
      privateKey = j.private_key;
    } catch (e) {
      // JSON emas: alohida o'zgaruvchilarga qaytamiz
    }
  }
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey: normalizePem(privateKey) }) });
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

const VERSION = "v12";
const safeMsg = (m) => String(m || "").replace(/[A-Za-z0-9+\/=_-]{30,}/g, "...").replace(/\s+/g, " ").slice(0, 140);

// Telegram Bot API
const tgApi = (m, p) => fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${m}`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p),
}).then((r) => r.json());
const normChannel = (c) => {
  const v = String(c || "").trim().replace(/^https?:\/\/t\.me\//, "@");
  return /^@[A-Za-z0-9_]{5,32}$/.test(v) ? v : "";
};

// Postlarni kanalga yuboradi. Kanalni birinchi bog'lagan foydalanuvchi egasi hisoblanadi.
async function sendPosts(db, uid, chat, posts) {
  const fail = (error) => posts.map(() => ({ ok: false, error }));
  const ref = db.collection("channels").doc(chat.slice(1).toLowerCase());
  const snap = await ref.get();
  if (snap.exists && snap.data().owner !== uid) return fail("bu kanal boshqa foydalanuvchiga bog'langan");
  const botId = Number(String(process.env.TELEGRAM_BOT_TOKEN || "").split(":")[0]);
  const me = await tgApi("getChatMember", { chat_id: chat, user_id: botId });
  if (!me.ok || me.result?.status !== "administrator" || me.result?.can_post_messages === false)
    return fail("bot kanalga admin (Post messages huquqi bilan) qilib qo'shilmagan");
  if (!snap.exists) await ref.set({ owner: uid, at: FieldValue.serverTimestamp() });
  const out = [];
  for (const t of posts) {
    const r = await tgApi("sendMessage", { chat_id: chat, text: t.slice(0, 4096) });
    out.push(r.ok ? { ok: true } : { ok: false, error: String(r.description || "xato").slice(0, 80) });
  }
  return out;
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
  if (req.method === "GET" && (req.url || "").split("?")[0].replace(/^\/api/, "") === "/status") {
    // Faqat "bor/yo'q" ko'rsatiladi, qiymatlarning o'zi hech qachon chiqmaydi
    const env = process.env;
    const info = {
      version: VERSION,
      FIREBASE_PROJECT_ID: !!env.FIREBASE_PROJECT_ID,
      FIREBASE_CLIENT_EMAIL: !!env.FIREBASE_CLIENT_EMAIL,
      FIREBASE_PRIVATE_KEY: !!env.FIREBASE_PRIVATE_KEY,
      FIREBASE_SERVICE_ACCOUNT: !!env.FIREBASE_SERVICE_ACCOUNT,
      GROQ_API_KEY: !!env.GROQ_API_KEY,
      TELEGRAM_BOT_TOKEN: !!env.TELEGRAM_BOT_TOKEN,
    };
    if (env.FIREBASE_SERVICE_ACCOUNT) {
      try { const j = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT); info.jsonValid = true; info.jsonHasPrivateKey = typeof j.private_key === "string" && j.private_key.includes("BEGIN PRIVATE KEY"); info.jsonProject = j.project_id || null; }
      catch (e) { info.jsonValid = false; info.jsonError = safeMsg(e.message); }
    }
    try { getAuth(app()); info.firebaseInit = "ok"; }
    catch (e) { info.firebaseInit = "xato: " + safeMsg(e.message); }
    return res.status(200).json(info);
  }
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
    let authSvc;
    try { authSvc = getAuth(app()); }
    catch (e) {
      console.error("Firebase sozlamasi xato:", e.message);
      return send(500, { error: `Serverda Firebase sozlamasi noto'g'ri [${VERSION}]: ${safeMsg(e.message)}` });
    }
    let uid;
    try { uid = (await authSvc.verifyIdToken(String(body.idToken || ""))).uid; }
    catch (e) {
      console.error("Token xatosi:", e.code, e.message);
      return send(401, { error: `Qaytadan kiring (${e.code || "token"})` });
    }

    const db = getFirestore(app());
    const agentId = String(body.agentId || "");
    if (!agentId || agentId.includes("/")) return send(404, { error: "Agent topilmadi" });
    const agentSnap = await db.collection("agents").doc(agentId).get();
    const agent = agentSnap.exists ? agentSnap.data() : BUILTIN_AGENTS[agentId];
    if (!agent) return send(404, { error: "Agent topilmadi" });
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

      // Saqlangan ma'lumot: umumiy (ism, yosh...) va shu agent uchun maydonlar bo'yicha
      const clean = (v, n) => String(v).replace(/[\r\n]+/g, " ").slice(0, n);
      const fields = NEEDS[agentId] || DEFAULT_NEEDS;
      const keys = fields.map((f) => f[0]);
      let known = {};
      let extra = "\n\nQoidalar: foydalanuvchiga ismi bilan murojaat qil. Javoblar qisqa va aniq bo'lsin. O'zingni ChatGPT yoki boshqa model nomi bilan tanishtirma, shu saytdagi yordamchi agent deb tanishtir.";
      try {
        const u = (await db.collection("users").doc(uid).get()).data() || {};
        if (u.profile && typeof u.profile === "object") {
          const parts = Object.entries(u.profile).slice(0, 10).map(([k, v]) => `${clean(k, 20)}: ${clean(v, 400)}`);
          if (parts.length) extra += "\n\nFoydalanuvchi o'zi haqida yozgan ma'lumot: " + parts.join(", ") + ". Buni qayta so'rama.";
        }
        const ai = u.agentInfo && u.agentInfo[agentId];
        if (ai && typeof ai === "object") known = ai;
      } catch {}
      const have = fields.filter(([k]) => known[k]).map(([k, l]) => `- ${l}: ${clean(known[k], 300)}`);
      const miss = fields.filter(([k]) => !known[k]).map(([k, l]) => `- ${l}`);
      if (have.length) extra += `\n\nAvval olingan ma'lumotlar (QAYTA SO'RAMA):\n${have.join("\n")}`;
      if (miss.length) extra += `\n\nVazifa uchun hali yetishmayotgan ma'lumotlar:\n${miss.join("\n")}\nFoydalanuvchi hali vazifa bermagan bo'lsa, yetishmayotganlarni bittadan, qisqa savol bilan so'ra. Agar foydalanuvchi aniq vazifa bergan bo'lsa (masalan, \"shu mavzuda matn yoz\"), ma'lumot yetishmasa ham darhol vazifani bajar, kerak bo'lsa oqilona taxmin qil va oxirida bitta aniqlashtiruvchi savol ber. Foydalanuvchi bir javobda bir nechtasini yozsa, hammasini qabul qil.`;
      else extra += "\n\nKerakli ma'lumotlarning hammasi bor. Foydalanuvchi vazifa bergan bo'lsa bajar, bermagan bo'lsa \"Endi vazifani yozing\" de.";
      if (keys.length) extra += `\n\nFoydalanuvchi yangi ma'lumot bersa, javobing eng oxirida har biri uchun alohida qatorda [[SAQLASH: kalit=qiymat]] yoz. Kalit faqat shulardan: ${keys.join(", ")}. Foydalanuvchiga bu belgi haqida gapirma.`;
      const tgChat = TG_AGENTS.has(agentId) && body.consent === true ? normChannel(body.channel) : "";
      if (TG_AGENTS.has(agentId)) {
        const when = agentId === "telegram-post"
          ? "Foydalanuvchi post matnini so'rasa"
          : "Foydalanuvchi matnni kanalga yuborishni (tashlash, joylash, yozish) aniq so'rasagina";
        if (tgChat) extra += `\n\nFoydalanuvchi ${tgChat} kanaliga avtomatik yuborishga rozilik bergan. ${when}, aynan SO'RALGAN matnni tayyorla va [[POST: matn]] ichiga yoz, u kanalga o'zi yuboriladi. [[POST: ]] ichida faqat kanalga chiqadigan tayyor matn bo'lsin: hech qachon savol, salomlashuv, o'zingni tanishtirish yoki izoh yozma. Izohni [[POST: ]] dan tashqarida qisqa yoz. Foydalanuvchi kanalga yuborishni so'ramagan bo'lsa (masalan, faqat g'oya, reja yoki ro'yxat so'ragan bo'lsa), vazifa bermagan bo'lsa yoki sen savol berayotgan bo'lsang, [[POST: ]] ishlatma, oddiy javob ber. Bir javobda ko'pi bilan 5 ta post. Misol: foydalanuvchi "kanalga salom deb yoz" desa, javobing: Mana post:\n[[POST: Salom, aziz kanal a'zolari!]]`;
        else extra += "\n\nKanalga avtomatik yuborish yoqilmagan. Faqat matn tayyorla va [[POST:]] belgisini ishlatma. Foydalanuvchi matnni kanalga yubortirmoqchi bo'lsa, sahifadagi maydonga kanal @username ni yozib, rozilik belgisini qo'yishini ayt.";
      }

      // Umumiy kunlik himoya: anonim kirish ko'p bo'lsa, Groq hisobingiz bir kunda bo'shab ketmasin
      const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const dayRef = db.collection("usage").doc(`_day_${day}`);
      const dayCap = Number(process.env.DAILY_TOKEN_CAP || 500000);
      if (((await dayRef.get()).data()?.tokens || 0) >= dayCap)
        return send(429, { error: "Bugungi umumiy limit tugadi. Ertaga urinib ko'ring.", used, limit });

      // Har agent o'z modelini ishlatishi mumkin, aks holda umumiy GROQ_MODEL
      const own = String(agent.model || "").trim();
      const model = /^[\w./:-]{1,80}$/.test(own) ? own : (process.env.GROQ_MODEL || "llama-3.3-70b-versatile");
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({
          model: model,
          messages: [{ role: "system", content: String(agent.systemPrompt || "") + extra }, ...history],
        }),
      });
      if (r.status === 429) return send(429, { error: "Groq limiti vaqtincha tugadi. Birozdan keyin urinib ko'ring.", used, limit });
      if (!r.ok) {
        // Sababini ko'rsatamiz (kalit yoki model xatosini tezda topish uchun); kalitning o'zi hech qachon qaytarilmaydi
        let why = "";
        try { why = ((await r.json())?.error?.message || "").replace(/\s+/g, " ").slice(0, 160); } catch {}
        console.error("Groq xatosi", r.status, model, why);
        return send(502, { error: `Agent javob bera olmadi (Groq ${r.status}, model: ${model}${why ? ": " + why : ""})`, used, limit });
      }
      const d = await r.json();
      const spent = d.usage?.total_tokens || 0;
      await Promise.all([
        usageRef.set({ tokens: FieldValue.increment(spent) }, { merge: true }),
        dayRef.set({ tokens: FieldValue.increment(spent) }, { merge: true }),
      ]);

      // Modeldan kelgan [[SAQLASH: kalit=qiymat]] belgilarini maydon bo'yicha saqlaymiz
      let reply = d.choices?.[0]?.message?.content || "";
      const upd = {};
      for (const m of reply.matchAll(/\[\[SAQLASH:\s*([\w-]+)\s*=\s*([\s\S]*?)\]\]/g)) {
        const v = clean(m[2].trim(), 400);
        if (keys.includes(m[1]) && v) upd[m[1]] = v;
      }
      if (Object.keys(upd).length) {
        try { await db.collection("users").doc(uid).set({ agentInfo: { [agentId]: upd } }, { merge: true }); }
        catch (e) { console.error(e); }
      }
      reply = reply.replace(/\[\[SAQLASH:[\s\S]*?\]\]/g, "").replace(/\[\[SAQLASH:[\s\S]*$/, "").trim();
      // [[POST: ...]] belgilarini kanalga yuboramiz va javobda natijani ko'rsatamiz
      const results = [];
      if (tgChat && messages.length > 1) {
        const all = [...reply.matchAll(/\[\[POST:([\s\S]*?)\]\]/g)].map((m) => m[1].trim());
        const okIdx = [];
        // Bo'sh yoki savol bilan tugaydigan matn post emas, yuborilmaydi
        all.forEach((t, i) => { if (t && !/\?\s*$/.test(t) && okIdx.length < 5) okIdx.push(i); });
        if (okIdx.length) {
          let sent;
          try { sent = await sendPosts(db, uid, tgChat, okIdx.map((i) => all[i])); }
          catch (e) { console.error(e); sent = okIdx.map(() => ({ ok: false, error: "xato" })); }
          okIdx.forEach((i, n) => { results[i] = sent[n]; });
        }
      }
      let pi = 0;
      reply = reply.replace(/\[\[POST:([\s\S]*?)\]\]/g, (_, t) => {
        const r = results[pi++];
        const txt = t.trim();
        if (!txt) return "";
        if (!r) return txt;
        return r.ok ? `✅ Kanalga yuborildi:\n${txt}` : `⚠️ Yuborilmadi (${r.error}):\n${txt}`;
      }).trim();
      return send(200, { reply, used: used + spent, limit });
    }
    return send(404, { error: "Topilmadi" });
  } catch (e) {
    console.error(e);
    return send(500, { error: "Server xatosi" });
  }
};
module.exports._verifyTelegram = verifyTelegram;
