import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { execFile, spawn } from "child_process";
import { startServer, stopServer } from "./server.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let serverPort = null;

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

ipcMain.on("win:minimize", () => mainWindow?.minimize());

ipcMain.on("win:maximize", () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});

ipcMain.on("win:close", () => mainWindow?.close());

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

  const indexPath = path.join(__dirname, "index.html");
  await mainWindow.loadFile(indexPath, { query: { apiPort: String(serverPort) } });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", async () => {
  await stopServer();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});