import { app, BrowserWindow } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { startServer, stopServer } from "./server.js";
import { ipcMain } from "electron";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let serverPort = null;

ipcMain.on("win:minimize", () => mainWindow?.minimize());
ipcMain.on("win:maximize", () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on("win:close", () => mainWindow?.close());

async function createWindow() {
  // API на свободном порту
  const s = await startServer(0);
  serverPort = s.address().port;

mainWindow = new BrowserWindow({
  width: 1200,
  height: 820,
  frame: false,          // стандартный title bar
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

  mainWindow.on("closed", () => (mainWindow = null));
}

app.whenReady().then(createWindow);

app.on("window-all-closed", async () => {
  await stopServer();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});