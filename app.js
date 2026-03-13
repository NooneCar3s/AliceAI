const messages = document.getElementById("messages");
const input = document.getElementById("input");
const statusText = document.getElementById("statusText");
const modeSelect = document.getElementById("modeSelect");

const notificationSound = new Audio("notification.mp3");

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

aliceImage.classList.add("alice-breathe");
setEmotion(EMOTIONS.idle);

input.focus();
resetIdleTimer();

function addMessage(text, sender) {
  const div = document.createElement("div");
  div.classList.add("message", sender);
  div.innerText = text;

  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;

  resetIdleTimer();

  if (sender === "ai") {
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

    typing.remove();
    addMessage(data.reply, "ai");

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


// ===== SPLASH CONTROL (5 секунд) =====

window.addEventListener("load", () => {

  const splash = document.getElementById("splash");
  const percent = document.getElementById("progressPercent");

  let p = 0;

  const interval = setInterval(() => {

    p += 2;

    if (p >= 100){
      p = 100;
      clearInterval(interval);
    }

    if (percent) percent.textContent = p + "%";

  }, 100); // прогресс обновляется каждые 100мс

  setTimeout(() => {

    if (splash) splash.classList.add("hidden");

  }, 5000); // 5 секунд

});