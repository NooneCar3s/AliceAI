import "dotenv/config";
import { Telegraf } from "telegraf";

const BOT_TOKEN = process.env.BOT_TOKEN;
const API_BASE = process.env.API_BASE || "http://127.0.0.1:3000";

if (!BOT_TOKEN) {
  console.error("❌ Не задан BOT_TOKEN. Запусти так: set BOT_TOKEN=... ; node telegram-bot.js");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// режим на пользователя (в RAM)
const userMode = new Map(); // chatId -> "standard"|"assist"|"care"

function getSessionId(ctx) {
  return String(ctx.chat?.id || ctx.from?.id || "default");
}
function getMode(ctx) {
  return userMode.get(getSessionId(ctx)) || "standard";
}
function setMode(ctx, mode) {
  userMode.set(getSessionId(ctx), mode);
}

function modeLabel(mode) {
  return mode === "standard" ? "Стандарт" : mode === "assist" ? "Ассистент" : "Забота";
}

function tgSafe(text) {
  // Telegram лимит ~4096 символов
  const s = String(text ?? "");
  return s.length > 3900 ? s.slice(0, 3900) + "\n\n…(обрезано)" : s;
}

async function healthCheck() {
  try {
    const r = await fetch(`${API_BASE}/health`);
    if (!r.ok) return false;
    const data = await r.json().catch(() => null);
    return !!data?.ok;
  } catch {
    return false;
  }
}

bot.start(async (ctx) => {
  const ok = await healthCheck();
  const extra = ok
    ? "✅ Сервер Алисы доступен."
    : "⚠️ Сервер Алисы недоступен. Запусти: node server.js";

  await ctx.reply(
    "Я тут 🙂\n" +
    extra + "\n\n" +
    "Команды:\n" +
    "/mode standard — Стандарт\n" +
    "/mode assist — Ассистент\n" +
    "/mode care — Забота\n" +
    "/mode — показать текущий режим\n" +
    "/reset — начать заново\n" +
    "/ping — проверить связь"
  );
});

bot.command("ping", async (ctx) => {
  const ok = await healthCheck();
  await ctx.reply(ok ? "✅ Связь ок" : "❌ Сервер недоступен. Запусти: node server.js");
});

bot.command("reset", async (ctx) => {
  const sessionId = getSessionId(ctx);
  try {
    const r = await fetch(`${API_BASE}/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId })
    });

    if (!r.ok) throw new Error(`HTTP ${r.status}`);

    await ctx.reply("Окей 🙂 Начнём заново.");
  } catch (e) {
    console.error(e);
    await ctx.reply("Не смогла сброситься 😢 (сервер недоступен)");
  }
});

bot.command("mode", async (ctx) => {
  const parts = (ctx.message.text || "").trim().split(/\s+/);
  const m = (parts[1] || "").toLowerCase();

  if (!m) {
    const cur = getMode(ctx);
    return ctx.reply(`Текущий режим: ${modeLabel(cur)} ✅\nИспользуй: /mode standard | assist | care`);
  }

  if (!["standard", "assist", "care"].includes(m)) {
    return ctx.reply("Используй: /mode standard | assist | care");
  }

  setMode(ctx, m);
  await ctx.reply(`Режим: ${modeLabel(m)} ✅`);
});

bot.on("text", async (ctx) => {
  const sessionId = getSessionId(ctx);
  const mode = getMode(ctx);
  const text = (ctx.message.text || "").trim();

  if (!text) return;

  try {
    await ctx.sendChatAction("typing");

    const r = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, sessionId, mode })
    });

    // если сервер вернул не JSON — не падаем
    const raw = await r.text();
    let data = null;
    try { data = JSON.parse(raw); } catch { data = null; }

    const reply = data?.reply || (r.ok ? "Ой… я подвисла 🥲" : `Ошибка сервера (HTTP ${r.status})`);
    await ctx.reply(tgSafe(reply));

  } catch (e) {
    console.error(e);
    await ctx.reply("Не могу связаться с Алисой 😢 (проверь, что server.js запущен)");
  }
});

bot.launch();
console.log("✅ Telegram bot started (polling)");
console.log("API_BASE =", API_BASE);

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));