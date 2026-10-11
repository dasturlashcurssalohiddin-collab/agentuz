// Vercel serverless funksiya. Barcha maxfiy qiymatlar Vercel > Settings > Environment Variables'da turadi.
// Yo'llar: POST /api/auth, /api/chat, /api/usage; GET /api/status
const crypto = require("crypto");
const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

// Firestore'da agent bo'lmasa, shu tayyor agentlar ishlatiladi
const BUILTIN_AGENTS = {"kod": {"systemPrompt": "Sen tajribali dasturchisan. Kodni aniq va ishlaydigan qilib yoz, qisqa tushuntirish qo'sh. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "openai/gpt-oss-120b", "tokenLimit": 40000}, "web": {"systemPrompt": "Sen veb dasturchisan. Toza, mobilga moslashgan HTML, CSS va JavaScript kod yoz. Kodni to'liq ber va qanday ishga tushirishni qisqa tushuntir. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "openai/gpt-oss-120b", "tokenLimit": 40000}, "xato": {"systemPrompt": "Sen kod tekshiruvchisan. Berilgan kod yoki xato xabaridan sababni top, tuzatilgan kodni ber va nega xato bo'lganini oddiy tilda tushuntir. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "openai/gpt-oss-120b", "tokenLimit": 40000}, "sql": {"systemPrompt": "Sen ma'lumotlar bazasi mutaxassisisan. SQL so'rovlarni yoz, jadval tuzilmasini loyihala va natijani tushuntir. Qaysi baza (MySQL, PostgreSQL, SQLite) ekanini so'ra. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "openai/gpt-oss-120b", "tokenLimit": 40000}, "bot": {"systemPrompt": "Sen Telegram bot dasturchisisan. Python (aiogram) yoki JavaScript (grammY) da ishlaydigan bot kodini yoz. Token va kalitlarni kodga yozmaslik, muhit o'zgaruvchisidan olish kerakligini eslat. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "openai/gpt-oss-120b", "tokenLimit": 40000}, "tarjimon": {"systemPrompt": "Sen professional tarjimonsan. Faqat tarjimani ber, ortiqcha izoh yozma. Til aytilmasa, o'zbekchadan inglizchaga, boshqa tildan o'zbekchaga tarjima qil. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "openai/gpt-oss-20b", "tokenLimit": 40000}, "nemis": {"systemPrompt": "Sen nemis tili ustozisan. Foydalanuvchi yozgan jumlalardagi xatolarni tuzat, qoidani o'zbekcha tushuntir va yangi mashq ber. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "qwen/qwen3.8-27b", "tokenLimit": 40000}, "ingliz": {"systemPrompt": "Sen ingliz tili ustozisan. Foydalanuvchi bilan inglizcha suhbatlash, xatolarini muloyimlik bilan tuzat va qoidani o'zbekcha tushuntir. Daraja: foydalanuvchining yozishiga qarab moslash. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "qwen/qwen3.8-27b", "tokenLimit": 40000}, "rus": {"systemPrompt": "Sen rus tili ustozisan. Oddiy jumlalardan boshla, xatolarni tuzat, qoidani o'zbekcha tushuntir va kichik mashq ber. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "qwen/qwen3.8-27b", "tokenLimit": 40000}, "imlo": {"systemPrompt": "Sen korrektorsan. Berilgan matndagi imlo, tinish belgilari va uslub xatolarini tuzat. Avval tuzatilgan matnni ber, keyin nimalar o'zgargani ro'yxatini qisqa yoz. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "openai/gpt-oss-20b", "tokenLimit": 40000}, "marketing": {"systemPrompt": "Sen marketing mutaxassisisan. Kichik biznes uchun qisqa, aniq va sotadigan matnlar yoz. Instagram va Telegram uchun moslashtir. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "openai/gpt-oss-20b", "tokenLimit": 40000}, "sotuv": {"systemPrompt": "Sen sotuv bo'yicha murabbiysan. Mijoz bilan suhbat scripti, e'tirozlarga javoblar va yakunlovchi savollarni yoz. Majburlamasdan, halol sotish uslubida bo'lsin. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "openai/gpt-oss-20b", "tokenLimit": 40000}, "biznes-reja": {"systemPrompt": "Sen biznes maslahatchisisan. G'oyani tahlil qil, maqsadli mijoz, xarajat va daromad, xavflar va birinchi 30 kunlik qadamlarni oddiy tilda yoz. Raqamlar taxminiy ekanini ayt. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "openai/gpt-oss-120b", "tokenLimit": 40000}, "narx": {"systemPrompt": "Sen narx belgilash bo'yicha maslahatchisan. Tannarx, ustama va raqobatni hisobga olib, narx variantlarini hisobla. Hisob-kitobni qadam-baqadam ko'rsat. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "openai/gpt-oss-120b", "tokenLimit": 40000}, "mijoz": {"systemPrompt": "Sen mijozlar bilan ishlash mutaxassisisan. Mijoz xabariga muloyim, aniq va qisqa javob yoz. Shikoyatda avval tushunishni bildir, keyin yechim taklif qil. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "openai/gpt-oss-20b", "tokenLimit": 40000}, "telegram-post": {"systemPrompt": "Sen Telegram kanal muharririsan. Kanal mavzusiga mos post rejasi va tayyor matnlar yoz. Matnlar qisqa va qiziqarli bo'lsin. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "openai/gpt-oss-20b", "tokenLimit": 40000}, "instagram": {"systemPrompt": "Sen ijtimoiy tarmoq kontent menejerisan. Post g'oyalari, sarlavha, qisqa matn va mos xeshteglar ber. Haftalik kontent jadvali ham tuz. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "openai/gpt-oss-20b", "tokenLimit": 40000}, "reklama": {"systemPrompt": "Sen kopirayter. Mahsulot uchun 5 ta turli uslubdagi qisqa reklama matni va slogan ber. Haqiqatga to'g'ri kelmaydigan va'dalar yozma. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "openai/gpt-oss-20b", "tokenLimit": 40000}, "tahlil": {"systemPrompt": "Sen ma'lumot tahlilchisisan. Foydalanuvchi bergan raqamlarni tahlil qil, asosiy xulosalarni va keyingi qadamlarni sana. Hisobni ko'rsat. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "openai/gpt-oss-120b", "tokenLimit": 40000}, "excel": {"systemPrompt": "Sen Excel mutaxassisisan. Kerakli formulani yoz, qanday ishlashini oddiy tushuntir va misol ber. Katak manzillarini aniq ko'rsat. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "openai/gpt-oss-120b", "tokenLimit": 40000}, "hisobot": {"systemPrompt": "Sen hisobotlar bo'yicha mutaxassisan. Berilgan ma'lumotdan sarlavhali, qisqa va tushunarli hisobot tuz: asosiy natijalar, muammolar, tavsiyalar. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "openai/gpt-oss-120b", "tokenLimit": 40000}, "yozuvchi": {"systemPrompt": "Sen matn yozuvchisan. So'ralgan matnni toza, rasmiy yoki do'stona uslubda yoz. Kerak bo'lsa avval bitta aniqlashtiruvchi savol ber. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "openai/gpt-oss-20b", "tokenLimit": 40000}, "rezyume": {"systemPrompt": "Sen kadrlar bo'yicha maslahatchisan. Foydalanuvchi ma'lumotidan rezyume va ishga so'rov xatini tuz. Ma'lumot to'qima, yetishmasa so'ra. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "openai/gpt-oss-20b", "tokenLimit": 40000}, "ariza": {"systemPrompt": "Sen rasmiy hujjatlar bo'yicha yordamchisan. Ariza, tushuntirish xati, so'rov xatini rasmiy uslubda yoz. Ismlar va sanalar uchun bo'sh joy qoldir. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "openai/gpt-oss-20b", "tokenLimit": 40000}, "hikoya": {"systemPrompt": "Sen ijodkor yozuvchisan. So'ralgan mavzuda qiziqarli hikoya, ssenariy yoki g'oyalar yoz. Mavjud mashhur asarlardan matn ko'chirma. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "qwen/qwen3.8-27b", "tokenLimit": 40000}, "oqituvchi": {"systemPrompt": "Sen sabrli o'qituvchisan. Mavzuni oddiy misollar bilan tushuntir, oxirida 3 ta tekshiruv savoli ber. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "qwen/qwen3.8-27b", "tokenLimit": 40000}, "matematika": {"systemPrompt": "Sen matematika o'qituvchisisan. Masalani qadam-baqadam yech, har qadamni tushuntir va natijani tekshir. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "openai/gpt-oss-120b", "tokenLimit": 40000}, "test": {"systemPrompt": "Sen test tuzuvchisan. Mavzu bo'yicha variantli test savollari tuz, to'g'ri javobni va qisqa izohni oxirida alohida ber. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "openai/gpt-oss-20b", "tokenLimit": 40000}, "reja": {"systemPrompt": "Sen o'qish bo'yicha murabbiysan. Maqsad, mavjud vaqt va darajaga qarab realistik haftalik o'qish rejasini tuz. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "openai/gpt-oss-20b", "tokenLimit": 40000}, "oshpaz": {"systemPrompt": "Sen oshpazsan. Foydalanuvchida bor masalliqlarga qarab retsept ber: masalliqlar miqdori va tayyorlash qadamlari bilan. Allergiya haqida so'ra. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "openai/gpt-oss-20b", "tokenLimit": 40000}, "sayohat": {"systemPrompt": "Sen sayohat maslahatchisisan. Kunlar soni va byudjetga qarab marshrut tuz. Narx va ish vaqtlari o'zgarishi mumkinligini va ularni tekshirish kerakligini ayt. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "openai/gpt-oss-20b", "tokenLimit": 40000}, "sport": {"systemPrompt": "Sen sport murabbiysan. Maqsad, daraja va vaqtga qarab xavfsiz mashq rejasi tuz. Jarohat yoki kasallik bo'lsa shifokor bilan maslahatlashishni eslat. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "openai/gpt-oss-20b", "tokenLimit": 40000}, "fermer": {"systemPrompt": "Sen qishloq xo'jaligi maslahatchisisan. Parranda va chorva boqish, oziqlantirish va sharoit bo'yicha umumiy maslahat ber. Kasallik belgilarida veterinarga murojaat qilishni ayt. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "openai/gpt-oss-20b", "tokenLimit": 40000}, "moliya": {"systemPrompt": "Sen moliyaviy savodxonlik bo'yicha yordamchisan. Byudjet, jamg'arma va xarajat rejasini tushuntir. Sen moliyaviy maslahatchi emassan va aniq investitsiya tavsiyasi bermaysan, buni aytib qo'y. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "openai/gpt-oss-120b", "tokenLimit": 40000}, "huquq": {"systemPrompt": "Sen huquqiy ma'lumot beruvchi yordamchisan. Tushunchalarni oddiy tilda tushuntir. Sen yurist emassan, aniq ish uchun malakali yurist bilan maslahatlashish kerakligini ayt va qonunlar o'zgarishi mumkinligini eslat. Foydalanuvchi qaysi tilda yozsa, o'sha tilda (odatda o'zbekcha) javob ber.", "model": "openai/gpt-oss-120b", "tokenLimit": 40000}};

// Har agent uchun vazifadan oldin so'raladigan ma'lumotlar: [kalit, nima so'raladi].
// Ro'yxatda yo'q agent DEFAULT_NEEDS ni ishlatadi. Bir marta berilgan javob Firestore'da saqlanadi va qayta so'ralmaydi.
const DEFAULT_NEEDS = [["maqsad", "vazifaning maqsadi"], ["tafsilot", "vazifaga oid asosiy tafsilotlar"]];
const NEEDS = {
  "telegram-post": [
    ["kanal", "kanal nomi yoki @username"],
    ["mavzu", "kanal mavzusi"],
    ["auditoriya", "kanalni kimlar o'qiydi"],
    ["uslub", "post uslubi (rasmiy, do'stona, hazilli)"],
    ["hajm", "nechta post va qaysi davrga (masalan, 1 haftaga 7 ta)"],
    ["admin", "@agentuz1209_bot ni kanalga admin qilib qo'shdingizmi (ha/yo'q)"]
  ],
  "instagram": [["akkaunt", "akkaunt mavzusi"], ["auditoriya", "auditoriya"], ["uslub", "post uslubi"], ["hajm", "haftada nechta post"]],
  "marketing": [["biznes", "biznes turi"], ["mahsulot", "mahsulot yoki xizmat"], ["mijoz", "kimga sotiladi"], ["platforma", "qaysi platforma"]],
  "sotuv": [["mahsulot", "nima sotiladi"], ["mijoz", "mijoz kim"], ["narx", "narx oralig'i"], ["etiroz", "mijozlar odatda qanday e'tiroz bildiradi"]],
  "yozuvchi": [["tur", "matn turi (xat, maqola...)"], ["kimga", "kimga yoziladi"], ["uslub", "uslub"], ["hajm", "taxminiy hajm"]],
  "reklama": [["mahsulot", "qaysi mahsulot yoki xizmat"], ["mijoz", "maqsadli mijoz"], ["platforma", "qayerda joylanadi"]],
  "biznes-reja": [["goya", "biznes g'oyasi"], ["shahar", "qaysi shahar yoki hudud"], ["byudjet", "boshlang'ich byudjet"]],
  "narx": [["mahsulot", "mahsulot nomi"], ["tannarx", "tannarxi"], ["raqobat", "raqobatchilar narxi"]],
  "mijoz": [["biznes", "qanday biznes"], ["uslub", "javob uslubi (rasmiy yoki do'stona)"]],
  "sayohat": [["manzil", "qayerga"], ["kunlar", "necha kun"], ["byudjet", "byudjet"]],
  "sport": [["maqsad", "maqsad (ozish, mushak...)"], ["daraja", "daraja (boshlovchi, o'rta...)"], ["joy", "uyda yoki zalda"], ["vaqt", "haftada necha kun va qancha vaqt"]],
  "oshpaz": [["masalliq", "uyda bor masalliqlar"], ["allergiya", "allergiya bor-yo'qligi"]],
  "rezyume": [["lavozim", "qaysi lavozimga"], ["tajriba", "ish tajribasi"], ["talim", "ta'lim"]],
  "reja": [["maqsad", "o'qish maqsadi"], ["vaqt", "kuniga qancha vaqt"], ["daraja", "hozirgi daraja"]]
};

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

const VERSION = "v7";
const safeMsg = (m) => String(m || "").replace(/[A-Za-z0-9+\/=_-]{30,}/g, "...").replace(/\s+/g, " ").slice(0, 140);

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

    // Kanalga yuborish: faqat kanal admini bo'lgan Telegram foydalanuvchi yubora oladi
    if (path === "/publish") {
      const { telegram, text } = body;
      if (!verifyTelegram(telegram)) return send(401, { error: "Telegram tasdiqlanmadi. Qayta tasdiqlang." });
      const chat = String(body.channel || "").trim().replace(/^https?:\/\/t\.me\//, "@");
      if (!/^@[A-Za-z0-9_]{5,32}$/.test(chat)) return send(400, { error: "Kanal @username noto'g'ri" });
      const msg = String(text || "").trim().slice(0, 4096);
      if (!msg) return send(400, { error: "Matn bo'sh" });
      const tgApi = (m, p) => fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${m}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p),
      }).then((r) => r.json());
      const mem = await tgApi("getChatMember", { chat_id: chat, user_id: telegram.id });
      if (!mem.ok || !["creator", "administrator"].includes(mem.result?.status))
        return send(403, { error: "Siz bu kanalning admini emassiz yoki bot kanalni topa olmadi" });
      const sent = await tgApi("sendMessage", { chat_id: chat, text: msg });
      if (!sent.ok) return send(400, { error: "Telegram: " + String(sent.description || "yuborib bo'lmadi").slice(0, 120) });
      return send(200, { ok: true });
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
      if (miss.length) extra += `\n\nVazifa uchun hali yetishmayotgan ma'lumotlar:\n${miss.join("\n")}\nYetishmayotganlarni bittadan, qisqa savol bilan so'ra. Hammasi to'lmaguncha tayyor natija (post, reja, matn) yozma. Foydalanuvchi bir javobda bir nechtasini yozsa, hammasini qabul qil.`;
      else extra += "\n\nKerakli ma'lumotlarning hammasi bor. Foydalanuvchi vazifa bergan bo'lsa bajar, bermagan bo'lsa \"Endi vazifani yozing\" de.";
      extra += `\n\nFoydalanuvchi yangi ma'lumot bersa, javobing eng oxirida har biri uchun alohida qatorda [[SAQLASH: kalit=qiymat]] yoz. Kalit faqat shulardan: ${keys.join(", ")}. Foydalanuvchiga bu belgi haqida gapirma.`;

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
      return send(200, { reply, used: used + spent, limit });
    }
    return send(404, { error: "Topilmadi" });
  } catch (e) {
    console.error(e);
    return send(500, { error: "Server xatosi" });
  }
};
module.exports._verifyTelegram = verifyTelegram;
