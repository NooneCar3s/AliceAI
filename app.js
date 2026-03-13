const messages = document.getElementById("messages");
const input = document.getElementById("input");
const statusText = document.getElementById("statusText");
const modeSelect = document.getElementById("modeSelect");

const notificationSound = new Audio("notification.mp3");
const splashSound = new Audio("voice/splash-hello.mp3");
splashSound.volume = 0.9;

// ===== command voices =====
const COMMAND_VOICE_MAP = {
  open_favorite_spotify: "voice/commands/open-spotify.mp3",
  pause_music: "voice/commands/pause-music.mp3",
  open_opera: "voice/commands/open-opera.mp3",
  open_steam: "voice/commands/open-steam.mp3",
  about_alice: "voice/commands/about-alice.mp3"
};

// В Electron получаем базовый URL API (порт динамический)
const API_BASE = window.aliceAPI?.getApiBase?.() || "http://127.0.0.1:3000";

// ===== Session id =====
const SESSION_ID_KEY = "alice_session_id";
let sessionId = localStorage.getItem(SESSION_ID_KEY);
if (!sessionId) {
  sessionId = crypto.randomUUID();
  localStorage.setItem(SESSION_ID_KEY, sessionId);
}

// ===== Mode =====
const MODE_KEY = "alice_mode";
let currentMode = localStorage.getItem(MODE_KEY) || "standard";
modeSelect.value = currentMode;

modeSelect.addEventListener("change", async () => {
  currentMode = modeSelect.value;
  localStorage.setItem(MODE_KEY, currentMode);
  await resetChat(true);
});

// ----- Alice image system -----
const aliceImage = document.getElementById("aliceImage");

const EMOTIONS = {
  normal: "normal",
  sad: "sad",
  sleepy: "sleepy",
  shy: "shy",
  happyToSee: "happyToSee",
  flirt: "flirt",
  flirtClose: "flirtClose",
  idle: "idle",
  wow: "wow",
  shy2: "shy2",
  cuteSmile: "cuteSmile"
};

let baseEmotion = EMOTIONS.normal;

let idleTimer = null;
const IDLE_MS = 30000;

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    setEmotion(EMOTIONS.idle, { temporary: true, returnMs: 0 });
  }, IDLE_MS);
}

function setEmotion(emotionName, opts = {}) {
  const { temporary = false, returnMs = 3500 } = opts;
  const file = EMOTIONS[emotionName] ? emotionName : EMOTIONS.normal;

  aliceImage.classList.remove("alice-react");
  aliceImage.classList.remove("fade-in");
  aliceImage.classList.add("fade-out");

  setTimeout(() => {
    aliceImage.src = `images/${file}.png`;
    aliceImage.classList.remove("fade-out");
    aliceImage.classList.add("fade-in");
    aliceImage.classList.add("alice-react");
    setTimeout(() => aliceImage.classList.remove("alice-react"), 350);
  }, 120);

  if (temporary && returnMs > 0) {
    setTimeout(() => setEmotion(baseEmotion, { temporary: false }), returnMs);
  }
}

function reactionFromText(text) {
  const t = (text || "").toLowerCase();
  if (t.includes("ого")) return EMOTIONS.wow;
  if (t.includes("груст")) return EMOTIONS.sad;
  if (t.includes("мм")) return EMOTIONS.shy;
  if (t.includes("ахах")) return EMOTIONS.cuteSmile;
  if (t.includes("обним")) return EMOTIONS.happyToSee;
  return null;
}

async function playCommandVoice(actionType) {
  const src = COMMAND_VOICE_MAP[actionType];
  if (!src) return;

  try {
    const audio = new Audio(src);
    audio.currentTime = 0;
    await audio.play();
  } catch (e) {
    console.warn("Command voice failed:", actionType, e);
  }
}

aliceImage.classList.add("alice-breathe");
setEmotion(EMOTIONS.idle);

input.focus();
resetIdleTimer();

function addMessage(text, sender, options = {}) {
  const { playNotification = sender === "ai" } = options;

  const div = document.createElement("div");
  div.classList.add("message", sender);
  div.innerText = text;

  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;

  resetIdleTimer();

  if (sender === "ai" && playNotification) {
    notificationSound.currentTime = 0;
    notificationSound.play().catch(() => {});
  }
}

function createTyping() {
  const div = document.createElement("div");
  div.classList.add("message", "ai");

  const typing = document.createElement("div");
  typing.classList.add("typing");
  typing.innerHTML = `<span></span><span></span><span></span>`;

  div.appendChild(typing);
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;

  return div;
}

function setUIBusy(isBusy) {
  input.disabled = isBusy;
  statusText.textContent = isBusy ? "думает…" : `online • ${currentMode}`;
  if (isBusy) setEmotion(EMOTIONS.sleepy, { temporary: true, returnMs: 0 });
}

async function handleDesktopAction(action) {
  if (!action?.type) return;

  try {
    if (action.type === "open_favorite_spotify") {
      const result = await window.spotifyControls?.openFavoritePlaylist?.();

      if (!result?.ok) {
        addMessage("Не смогла открыть Spotify 😢", "ai");
      }
      return;
    }

    if (action.type === "pause_music") {
      const result = await window.spotifyControls?.pause?.();

      if (!result?.ok) {
        addMessage("Не смогла поставить музыку на паузу 😢", "ai");
      }
      return;
    }

    if (action.type === "open_opera") {
      const result = await window.desktopControls?.openOpera?.();

      if (!result?.ok) {
        addMessage(result?.message || "Не смогла открыть Opera 😢", "ai");
      }
      return;
    }

    if (action.type === "open_steam") {
      const result = await window.desktopControls?.openSteam?.();

      if (!result?.ok) {
        addMessage(result?.message || "Не смогла открыть Steam 😢", "ai");
      }
      return;
    }
  } catch (e) {
    console.error("Desktop action failed:", e);
    addMessage("Не смогла выполнить команду 😢", "ai");
  }
}

async function sendMessage(event) {
  if (event) event.preventDefault();

  const text = input.value.trim();
  if (!text) return;

  setEmotion(baseEmotion, { temporary: false });

  addMessage(text, "user");
  input.value = "";
  setUIBusy(true);

  const typing = createTyping();

  try {
    const response = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, sessionId, mode: currentMode })
    });

    const data = await response.json();
    const isLocalAction = Boolean(data?.meta?.isLocalAction);

    typing.remove();

    addMessage(data.reply, "ai", {
      playNotification: !isLocalAction
    });

    if (isLocalAction && data?.action?.type) {
      await playCommandVoice(data.action.type);
    }

    await handleDesktopAction(data.action);

    const react = reactionFromText(data.reply);
    if (react) setEmotion(react, { temporary: true, returnMs: 2800 });
    else setEmotion(baseEmotion, { temporary: false });

  } catch (e) {
    typing.remove();
    addMessage("Ошибка соединения 😢", "ai");
    setEmotion(EMOTIONS.sad, { temporary: true, returnMs: 2000 });
  } finally {
    setUIBusy(false);
    input.disabled = false;
    input.focus();
  }
}

async function resetChat(silent = false) {
  messages.innerHTML = "";

  const label =
    currentMode === "standard" ? "Стандарт" :
    currentMode === "assist" ? "Ассистент" : "Забота";

  addMessage(
    silent ? `Режим: ${label}. Начнём заново 🙂` : "Окей 🙂 Начнём заново. Я тут.",
    "ai"
  );

  baseEmotion = EMOTIONS.normal;
  setEmotion(EMOTIONS.idle, { temporary: true, returnMs: 0 });

  await fetch(`${API_BASE}/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId })
  });

  statusText.textContent = `online • ${currentMode}`;
}

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage(e);
});

statusText.textContent = `online • ${currentMode}`;

document.getElementById("minBtn")?.addEventListener("click", () => {
  window.windowControls?.minimize();
});

document.getElementById("maxBtn")?.addEventListener("click", () => {
  window.windowControls?.maximize();
});

document.getElementById("closeBtn")?.addEventListener("click", () => {
  window.windowControls?.close();
});

// ===== GUIDE MODAL =====

const guideBtn = document.getElementById("guideBtn");
const guideModal = document.getElementById("guideModal");
const guideCloseBtn = document.getElementById("guideCloseBtn");
const guideBackdrop = guideModal?.querySelector(".guide-backdrop");

function openGuide() {
  guideModal?.classList.remove("hidden");
}

function closeGuide() {
  guideModal?.classList.add("hidden");
}

guideBtn?.addEventListener("click", openGuide);
guideCloseBtn?.addEventListener("click", closeGuide);
guideBackdrop?.addEventListener("click", closeGuide);

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;

  if (guideModal && !guideModal.classList.contains("hidden")) {
    closeGuide();
  }

  if (commandsModal && !commandsModal.classList.contains("hidden")) {
    closeCommands();
  }
});

// ===== COMMANDS MODAL =====

const commandsBtn = document.getElementById("commandsBtn");
const commandsModal = document.getElementById("commandsModal");
const commandsCloseBtn = document.getElementById("commandsCloseBtn");
const commandsBackdrop = commandsModal?.querySelector(".guide-backdrop");

function openCommands() {
  commandsModal?.classList.remove("hidden");
}

function closeCommands() {
  commandsModal?.classList.add("hidden");
}

commandsBtn?.addEventListener("click", openCommands);
commandsCloseBtn?.addEventListener("click", closeCommands);
commandsBackdrop?.addEventListener("click", closeCommands);

// ===== SPLASH CONTROL (5 секунд + голос) =====

window.addEventListener("load", () => {
  const splash = document.getElementById("splash");
  const percent = document.getElementById("progressPercent");

  let p = 0;

  setTimeout(() => {
    splashSound.currentTime = 0;
    splashSound.play().catch(() => {});
  }, 150);

  const interval = setInterval(() => {
    p += 2;

    if (p >= 100) {
      p = 100;
      clearInterval(interval);
    }

    if (percent) percent.textContent = p + "%";
  }, 100);

  setTimeout(() => {
    if (splash) splash.classList.add("hidden");
  }, 5000);
});