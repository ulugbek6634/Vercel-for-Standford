// Приём заявки с лендинга: Telegram + amoCRM + Meta Conversions API.
// Каждая интеграция включается, только если заданы её переменные окружения в Vercel.
const crypto = require("crypto");

const env = (k) => (process.env[k] || "").trim();
const clean = (v, max = 200) => String(v || "").replace(/[<>]/g, "").trim().slice(0, max);

async function sendTelegram(lead) {
  const token = env("TELEGRAM_BOT_TOKEN");
  if (!token) return "skip";
  let chats = env("TELEGRAM_CHAT_ID").split(",").map((s) => s.trim()).filter(Boolean);
  if (!chats.length) {
    // Чат не указан: шлём во все чаты, где боту недавно писали (например, /start в группе менеджеров).
    const u = await fetch(`https://api.telegram.org/bot${token}/getUpdates`).then((r) => r.json());
    const ids = new Set();
    for (const x of u.result || []) {
      const m = x.message || x.my_chat_member || x.channel_post;
      if (m && m.chat) ids.add(String(m.chat.id));
    }
    chats = [...ids];
    if (!chats.length) throw new Error("telegram: no chats, write /start to the bot");
  }
  const utm = Object.entries(lead.utm).map(([k, v]) => `${k}: ${v}`).join("\n");
  const text = [
    "🆕 Новая заявка с сайта",
    `👤 ${lead.name}`,
    `📞 ${lead.phone}`,
    lead.status ? `🛂 Виза/икамет: ${lead.status}` : "",
    `💬 WhatsApp: https://wa.me/${lead.phone.replace(/\D/g, "")}`,
    utm ? `\n${utm}` : "",
  ].filter(Boolean).join("\n");
  await Promise.all(chats.map((chat_id) =>
    fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id, text, disable_web_page_preview: true }),
    }).then((r) => { if (!r.ok) throw new Error("telegram " + r.status); })
  ));
  return "ok";
}

async function sendAmo(lead) {
  const sub = env("AMO_SUBDOMAIN"); // например: standarteducation
  const token = env("AMO_TOKEN");    // долгосрочный токен приватной интеграции
  if (!sub || !token) return "skip";
  const base = `https://${sub}.amocrm.ru/api/v4`;
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  const item = {
    name: `Сайт: ${lead.name}`,
    _embedded: {
      tags: [{ name: "landing" }, ...(lead.utm.utm_campaign ? [{ name: lead.utm.utm_campaign.slice(0, 50) }] : [])],
      contacts: [{
        first_name: lead.name,
        custom_fields_values: [{ field_code: "PHONE", values: [{ value: lead.phone, enum_code: "MOB" }] }],
      }],
    },
  };
  if (env("AMO_PIPELINE_ID")) item.pipeline_id = Number(env("AMO_PIPELINE_ID"));
  if (env("AMO_STATUS_ID")) item.status_id = Number(env("AMO_STATUS_ID"));
  const r = await fetch(`${base}/leads/complex`, { method: "POST", headers, body: JSON.stringify([item]) });
  if (!r.ok) throw new Error("amo " + r.status + " " + (await r.text()).slice(0, 300));
  const [created] = await r.json();
  const note = [
    "Заявка с лендинга",
    lead.status ? `Виза/икамет: ${lead.status}` : "",
    ...Object.entries(lead.utm).map(([k, v]) => `${k}: ${v}`),
    `Страница: ${lead.page}`,
  ].filter(Boolean).join("\n");
  if (created && created.id) {
    await fetch(`${base}/leads/${created.id}/notes`, {
      method: "POST", headers,
      body: JSON.stringify([{ note_type: "common", params: { text: note } }]),
    });
  }
  return "ok";
}

async function sendCapi(lead, req) {
  const pixel = env("META_PIXEL_ID");
  const token = env("META_CAPI_TOKEN");
  if (!pixel || !token) return "skip";
  const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
  const body = {
    data: [{
      event_name: "Lead",
      event_time: Math.floor(Date.now() / 1000),
      event_id: lead.eventId,
      action_source: "website",
      event_source_url: lead.page,
      user_data: {
        ph: [sha(lead.phone.replace(/\D/g, ""))],
        fn: [sha(lead.name.toLowerCase())],
        client_ip_address: (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || undefined,
        client_user_agent: req.headers["user-agent"],
        fbc: lead.utm.fbclid ? `fb.1.${Date.now()}.${lead.utm.fbclid}` : undefined,
      },
    }],
  };
  const r = await fetch(`https://graph.facebook.com/v19.0/${pixel}/events?access_token=${token}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("capi " + r.status);
  return "ok";
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  let b = req.body || {};
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
  if (b.website) return res.status(200).json({ ok: true }); // бот заполнил скрытое поле

  const phone = "+" + String(b.phone || "").replace(/\D/g, "").slice(0, 15);
  const name = clean(b.name, 80);
  if (name.length < 2 || phone.length < 8) return res.status(400).json({ ok: false, error: "bad_input" });

  const utm = {};
  for (const [k, v] of Object.entries(b.utm || {})) {
    if (/^(utm_\w+|fbclid)$/.test(k)) utm[k] = clean(v, 150);
  }
  const lead = { name, phone, status: clean(b.status, 60), utm, page: clean(b.page, 300), eventId: clean(b.eventId, 60) };

  const results = await Promise.allSettled([sendTelegram(lead), sendAmo(lead), sendCapi(lead, req)]);
  const [tg, amo, capi] = results.map((r) => (r.status === "fulfilled" ? r.value : "error: " + r.reason.message));
  console.log("lead", { phone: lead.phone, tg, amo, capi });

  // Заявка считается принятой, если дошла хотя бы до одного канала (или каналы ещё не настроены).
  const delivered = [tg, amo].some((x) => x === "ok");
  const configured = [tg, amo].some((x) => x !== "skip");
  if (configured && !delivered) return res.status(502).json({ ok: false });
  return res.status(200).json({ ok: true });
};
