const messages = document.getElementById("messages");
const input = document.getElementById("input");
const sendBtn = document.getElementById("sendBtn");
const expandBtn = document.getElementById("expandBtn");

const notificationSound = new Audio("notification.mp3");

const COMMAND_VOICE_MAP = {
  open_favorite_spotify: "voice/commands/open-spotify.mp3",
  pause_music: "voice/commands/pause-music.mp3",
  open_opera: "voice/commands/open-opera.mp3",
  open_steam: "voice/commands/open-steam.mp3",
  about_alice: "voice/commands/about-alice.mp3",
  open_youtube: "voice/commands/open-youtube.mp3",
  open_github: "voice/commands/open-github.mp3",
  open_twitch: "voice/commands/open-twitch.mp3"
};

const API_BASE = window.aliceAPI?.getApiBase?.() || "http://127.0.0.1:3000";

const SESSION_ID_KEY = "alice_session_id";
let sessionId = localStorage.getItem(SESSION_ID_KEY);
if (!sessionId) {
  sessionId = crypto.randomUUID();
  localStorage.setItem(SESSION_ID_KEY, sessionId);
}

const MODE_KEY = "alice_mode";
let currentMode = localStorage.getItem(MODE_KEY) || "standard";

expandBtn?.addEventListener("click", () => {
  window.windowControls?.expand();
});

function addMessage(text, sender, options = {}) {
  const { playNotification = sender === "ai" } = options;

  const div = document.createElement("div");
  div.classList.add("message", sender);
  div.innerText = text;

  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;

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
    if (action.type === "open_youtube") {
  const result = await window.desktopControls?.openYoutube?.();

  if (!result?.ok) {
    addMessage("Не смогла открыть YouTube 😢", "ai");
  }
  return;
}

if (action.type === "open_github") {
  const result = await window.desktopControls?.openGithub?.();

  if (!result?.ok) {
    addMessage("Не смогла открыть GitHub 😢", "ai");
  }
  return;
}

if (action.type === "open_twitch") {
  const result = await window.desktopControls?.openTwitch?.();

  if (!result?.ok) {
    addMessage("Не смогла открыть Twitch 😢", "ai");
  }
  return;
}
  } catch (e) {
    console.error("Desktop action failed:", e);
    addMessage("Не смогла выполнить команду 😢", "ai");
  }
}

async function sendMessage() {
  const text = input.value.trim();
  if (!text) return;

  addMessage(text, "user");
  input.value = "";

  const typing = createTyping();

  try {
    const response = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        sessionId,
        mode: currentMode
      })
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

  } catch (e) {
    typing.remove();
    addMessage("Ошибка соединения 😢", "ai");
  } finally {
    input.focus();
  }
}

sendBtn?.addEventListener("click", sendMessage);

input?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

window.addEventListener("load", () => {
  input.focus();
});