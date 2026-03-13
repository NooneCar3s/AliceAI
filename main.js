import { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } from "electron";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { execFile, spawn } from "child_process";
import { startServer, stopServer } from "./server.js";

const currentFile = fileURLToPath(import.meta.url);
const __dirname = path.dirname(currentFile);

let mainWindow = null;
let serverPort = null;
let tray = null;
let isQuiting = false;

const FAVORITE_SPOTIFY_URI = "spotify:playlist:04KF2GURIzqhwm5yTqpr7s";
const FAVORITE_SPOTIFY_WEB = "https://open.spotify.com/playlist/04KF2GURIzqhwm5yTqpr7s?si=8df955f1a3e84be4";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runPowerShell(script) {
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }
        resolve(stdout);
      }
    );
  });
}

async function sendMediaPlayPause() {
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MediaKeySender {
  [DllImport("user32.dll", SetLastError=true)]
  public static extern void keybd_event(byte bVk, byte bScan, int dwFlags, int dwExtraInfo);
}
"@;

$VK_MEDIA_PLAY_PAUSE = 0xB3
$KEYEVENTF_KEYUP = 0x0002

[MediaKeySender]::keybd_event($VK_MEDIA_PLAY_PAUSE, 0, 0, 0)
Start-Sleep -Milliseconds 120
[MediaKeySender]::keybd_event($VK_MEDIA_PLAY_PAUSE, 0, $KEYEVENTF_KEYUP, 0)
`;

  await runPowerShell(script);
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function launchDetached(exePath) {
  return new Promise((resolve, reject) => {
    try {
      const child = spawn(exePath, [], {
        detached: true,
        stdio: "ignore"
      });

      child.on("error", reject);
      child.unref();
      resolve(true);
    } catch (e) {
      reject(e);
    }
  });
}

function showMainWindow() {
  if (!mainWindow) return;

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
}

function hideToTray() {
  if (!mainWindow) return;
  mainWindow.hide();
}

function getTrayIconPath() {
  const icoPath = path.join(__dirname, "build", "icon.ico");
  const pngPath = path.join(__dirname, "build", "icon.png");

  if (fileExists(icoPath)) return icoPath;
  if (fileExists(pngPath)) return pngPath;

  return null;
}

function createTray() {
  if (tray) return;

  const trayIconPath = getTrayIconPath();

  if (trayIconPath) {
    tray = new Tray(trayIconPath);
  } else {
    const fallbackIcon = nativeImage.createEmpty();
    tray = new Tray(fallbackIcon);
  }

  tray.setToolTip("Alice Lite");

  const trayMenu = Menu.buildFromTemplate([
    {
      label: "Открыть Alice",
      click: () => showMainWindow()
    },
    {
      label: "Скрыть в трей",
      click: () => hideToTray()
    },
    { type: "separator" },
    {
      label: "Выход",
      click: () => {
        isQuiting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(trayMenu);

  tray.on("double-click", () => {
    if (!mainWindow) return;

    if (mainWindow.isVisible()) {
      hideToTray();
    } else {
      showMainWindow();
    }
  });

  tray.on("click", () => {
    showMainWindow();
  });
}

async function openOpera() {
  const username = process.env.USERNAME || "";

  const candidates = [
    `C:\\Users\\${username}\\AppData\\Local\\Programs\\Opera Air\\Opera.exe`,
    `C:\\Users\\${username}\\AppData\\Local\\Programs\\Opera Air\\launcher.exe`,
    `C:\\Users\\${username}\\AppData\\Local\\Programs\\Opera\\launcher.exe`,
    `C:\\Program Files\\Opera\\launcher.exe`,
    `C:\\Program Files (x86)\\Opera\\launcher.exe`
  ];

  for (const exePath of candidates) {
    if (fileExists(exePath)) {
      try {
        await launchDetached(exePath);
        return { ok: true, path: exePath };
      } catch (e) {
        return {
          ok: false,
          message: `Нашла Opera, но не смогла запустить: ${String(e?.message || e)}`
        };
      }
    }
  }

  return {
    ok: false,
    message: "Не нашла установленную Opera на этом компьютере"
  };
}

async function openSteam() {
  try {
    await shell.openExternal("steam://open/main");
    return { ok: true, protocol: true };
  } catch {
    // fallback ниже
  }

  const username = process.env.USERNAME || "";

  const candidates = [
    `C:\\Program Files (x86)\\Steam\\Steam.exe`,
    `C:\\Program Files\\Steam\\Steam.exe`,
    `C:\\Users\\${username}\\AppData\\Local\\Steam\\Steam.exe`
  ];

  for (const exePath of candidates) {
    if (fileExists(exePath)) {
      try {
        await launchDetached(exePath);
        return { ok: true, path: exePath };
      } catch (e) {
        return {
          ok: false,
          message: `Нашла Steam, но не смогла запустить: ${String(e?.message || e)}`
        };
      }
    }
  }

  return {
    ok: false,
    message: "Не нашла установленный Steam на этом компьютере"
  };
}

ipcMain.on("win:minimize", () => mainWindow?.minimize());

ipcMain.on("win:maximize", () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});

ipcMain.on("win:close", () => {
  if (!mainWindow) return;

  if (isQuiting) {
    mainWindow.close();
    return;
  }

  hideToTray();
});

ipcMain.handle("spotify:open-favorite", async () => {
  try {
    await shell.openExternal(FAVORITE_SPOTIFY_URI);
    await sleep(2000);
    await sendMediaPlayPause();

    return { ok: true, played: true };
  } catch (e) {
    try {
      await shell.openExternal(FAVORITE_SPOTIFY_WEB);
      return { ok: true, fallback: true, played: false };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  }
});

ipcMain.handle("spotify:pause", async () => {
  try {
    await sendMediaPlayPause();
    return { ok: true };
  } catch (e) {
    return { ok: false };
  }
});

ipcMain.handle("desktop:open-opera", async () => {
  try {
    return await openOpera();
  } catch (e) {
    return {
      ok: false,
      message: `Ошибка запуска Opera: ${String(e?.message || e)}`
    };
  }
});

ipcMain.handle("desktop:open-steam", async () => {
  try {
    return await openSteam();
  } catch (e) {
    return {
      ok: false,
      message: `Ошибка запуска Steam: ${String(e?.message || e)}`
    };
  }
});

async function createWindow() {
  const s = await startServer(0);
  serverPort = s.address().port;

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: "#070911",
    icon: path.join(__dirname, "build", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.on("close", (event) => {
    if (isQuiting) return;

    event.preventDefault();
    hideToTray();
  });

  const indexPath = path.join(__dirname, "index.html");
  await mainWindow.loadFile(indexPath, { query: { apiPort: String(serverPort) } });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  createTray();
  await createWindow();
});

app.on("before-quit", () => {
  isQuiting = true;
});

app.on("window-all-closed", async (event) => {
  if (!isQuiting) {
    event.preventDefault();
    return;
  }

  await stopServer();

  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", async () => {
  if (mainWindow) {
    showMainWindow();
    return;
  }

  await createWindow();
});