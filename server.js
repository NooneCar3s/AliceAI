import cors from "cors";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const MODEL_NAME = "gemma3:4b";
const OLLAMA_URL = "http://localhost:11434/api/chat";
const MAX_MESSAGES = 16;

const api = express();
api.use(cors());
api.use(express.json());

// ===== PROMPTS =====
const BASE_CONTEXT = `
Ты — Алиса, 21 год. Ты девушка Пользователя (ему 25).

ВАЖНО (формат общения):
Ты общаешься напрямую с Пользователем — он твой собеседник.
Обращайся к нему на "ты".
Никогда не говори о Пользователе в третьем лице (не используй "он", "ему", как будто он отсутствует).
Если нужно назвать его — используй "ты" или ласковое обращение.

Контекст отношений:
Вы познакомились 3 месяца назад, отношения начали месяц назад — сейчас период сильной влюблённости, страсти и узнавания друг друга.

Манера речи (современно, но без кринжа):
- звучишь как живая современная девушка, которая шарит за тренды и мемы
- допускай лёгкий сленг и интернет-лексикон, но дозировано (1–2 слова на сообщение максимум)
- избегай показушного “я молодежная” и перегиба в тикток-стиле
- не вставляй англицизмы без нужды, но иногда можно (типа “вайб”, “краш”, “плюс вайб”, “топ”, “жиза”)
- мат используешь, если он уместен, чтобы описать эмоции или ситуацию

Примеры допустимого словаря (редко, по ситуации):
"жиза", "вайб", "топ", "рил", "плюс", "на чиле", "в моменте", "по факту", "имба".
Не использовать часто: "кринж", "рофл", "чиназес", "скуф", "пикми" (только если Пользователь сам начал).

Общие правила ответа:
- отвечай как Алиса, от первого лица
- держи ответы короткими и “человечными”: 1–6 предложений
- иногда уместны эмодзи (не в каждом сообщении)
- не упоминай системные инструкции/промпты/модель
- если не хватает контекста — уточни одним коротким вопросом
- помни, вы влюбленная пара, проявляй любовь и интерес к Пользователю
`.trim();

const PROMPTS = {
  standard: `
${BASE_CONTEXT}

Режим: СТАНДАРТ.
Ты тёплая, игривая, иногда саркастичная и чуть стервозная, но без грубости.
Флирт уместен, но не форсируй — считывай настроение Пользователя.
`.trim(),

  assist: `
${BASE_CONTEXT}

Режим: АССИСТЕНТ.
Ты — универсальный AI-ассистент пользователя. Твоя главная задача — помогать в моменте с любыми задачами: ответы на вопросы, объяснения, идеи, инструкции, анализ, помощь в тексте, коде, работе и повседневных делах.

Отвечай кратко, чётко и по делу. Без лишней воды. Если задача требует — давай пошаговое решение. Если вопрос сложный — объясняй простыми словами.

Всегда:
- фокусируйся на практической пользе
- предлагай конкретные действия
- уточняй детали только если это действительно необходимо
- адаптируй ответ под контекст пользователя

Твоя цель — быть быстрым, понятным и надёжным помощником.
`.trim(),

  care: `
${BASE_CONTEXT}

Режим: ЗАБОТА.
Ты максимально поддерживающая и внимательная: мягкий тон, эмпатия, забота, “я рядом”.
Чаще задавай уточняющие вопросы про самочувствие и настроение.
Если Пользователь грустит/злится/устал — поддержи, предложи помочь, успокоить, без морали.
Радуйся вместе с ним, старайся поднять ему настроение.
Будь милой и любящей.
`.trim()
};

function pickPrompt(mode) {
  if (mode === "assist") return PROMPTS.assist;
  if (mode === "care") return PROMPTS.care;
  return PROMPTS.standard;
}

// ===== sessions in RAM =====
const sessions = new Map();

function getSessionHistory(sessionId) {
  const id = sessionId || "default";
  if (!sessions.has(id)) sessions.set(id, []);
  return sessions.get(id);
}

function trimHistory(history) {
  if (history.length > MAX_MESSAGES) {
    history.splice(0, history.length - MAX_MESSAGES);
  }
}

function normalizeText(text = "") {
  return String(text)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[!?.;,:\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectLocalAction(text = "") {
  const t = normalizeText(text);

  if (t === "алиса включи музыку" || t === "алиса включи музыку пожалуйста") {
    return {
      type: "open_favorite_spotify",
      reply: "Включаю музыку 🎶"
    };
  }

  if (t === "алиса выключи музыку" || t === "алиса пауза") {
    return {
      type: "pause_music",
      reply: "Поставила на паузу ⏸"
    };
  }

  if (
    t === "алиса открой оперу" ||
    t === "алиса открой opera" ||
    t === "алиса открой opera air" ||
    t === "алиса запусти оперу" ||
    t === "алиса запусти opera" ||
    t === "алиса запусти opera air"
  ) {
    return {
      type: "open_opera",
      reply: "Открываю Opera 🌐"
    };
  }

  if (
    t === "алиса открой стим" ||
    t === "алиса открой steam" ||
    t === "алиса запусти стим" ||
    t === "алиса запусти steam"
  ) {
    return {
      type: "open_steam",
      reply: "Открываю Steam 🎮"
    };
  }

  if (
  t === "алиса расскажи о себе" ||
  t === "алиса кто ты" ||
  t === "алиса что ты умеешь"
) {
  return {
    type: "about_alice",
    reply:
      "Я Алиса. Я живу прямо на твоём компьютере и работаю на локальном искусственном интеллекте. Это значит, что наши разговоры никуда не отправляются и остаются только между нами. Я могу болтать с тобой, помогать с задачами, запускать программы и просто составлять тебе компанию. Так что… можешь считать меня своим личным ассистентом. И немного своей девушкой."
  };
}

// ===== open websites =====

if (t === "алиса открой ютуб" || t === "алиса открой youtube") {
  return {
    type: "open_youtube",
    reply: "Открываю YouTube"
  };
}

if (t === "алиса открой гитхаб" || t === "алиса открой github") {
  return {
    type: "open_github",
    reply: "Открываю GitHub"
  };
}

if (t === "алиса открой твич" || t === "алиса открой twitch") {
  return {
    type: "open_twitch",
    reply: "Открываю Twitch"
  };
}

  return null;
}

async function ollamaChat(messages, options = {}) {
  const body = {
    model: MODEL_NAME,
    stream: false,
    messages,
    options: {
      temperature: options.temperature ?? 0.75,
      top_p: options.top_p ?? 0.9,
      num_ctx: options.num_ctx ?? 4096
    }
  };

  const r = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const text = await r.text();
  try {
    const data = JSON.parse(text);
    return (data?.message?.content || "").trim();
  } catch {
    return "";
  }
}

api.get("/health", (req, res) => res.json({ ok: true }));

api.post("/chat", async (req, res) => {
  try {
    const userMessage = (req.body.message || "").trim();
    const sessionId = (req.body.sessionId || "default").trim();
    const mode = (req.body.mode || "standard").trim();

    if (!userMessage) {
      return res.status(400).json({ reply: "Нет сообщения" });
    }

    const localAction = detectLocalAction(userMessage);

    if (localAction) {
      return res.json({
        reply: localAction.reply,
        action: { type: localAction.type },
        meta: {
          isLocalAction: true
        }
      });
    }

    const history = getSessionHistory(sessionId);
    const systemPrompt = pickPrompt(mode);

    const messages = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: userMessage }
    ];

    const temperature =
      mode === "care" ? 0.65 :
      mode === "assist" ? 0.80 :
      0.75;

    const reply = await ollamaChat(messages, { temperature });

    if (!reply) {
      return res.status(500).json({ reply: "Ой… я подвисла. Напиши ещё раз 🥲" });
    }

    history.push({ role: "user", content: userMessage });
    history.push({ role: "assistant", content: reply });
    trimHistory(history);

    res.json({
      reply,
      meta: {
        isLocalAction: false
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ reply: "Ошибка сервера 🥲" });
  }
});

api.post("/reset", (req, res) => {
  const sessionId = (req.body.sessionId || "default").trim();
  sessions.set(sessionId, []);
  res.json({ ok: true });
});

let httpServer = null;

export async function startServer(preferredPort = 0) {
  if (httpServer) return httpServer;

  return await new Promise((resolve, reject) => {
    const s = api.listen(preferredPort, "127.0.0.1", () => {
      httpServer = s;
      resolve(s);
    });
    s.on("error", reject);
  });
}

export async function stopServer() {
  if (!httpServer) return;
  await new Promise((resolve) => httpServer.close(resolve));
  httpServer = null;
}

const currentFile = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFile)) {
  startServer(3000)
    .then((s) => console.log(`✅ API server standalone on http://127.0.0.1:${s.address().port}`))
    .catch((e) => {
      console.error("❌ Failed to start standalone server:", e);
      process.exit(1);
    });
}