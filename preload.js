const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aliceAPI", {
  getApiBase: () => {
    const params = new URLSearchParams(window.location.search);
    const port = params.get("apiPort") || "3000";
    return `http://127.0.0.1:${port}`;
  }
});

contextBridge.exposeInMainWorld("windowControls", {
  minimize: () => ipcRenderer.send("win:minimize"),
  maximize: () => ipcRenderer.send("win:maximize"),
  close: () => ipcRenderer.send("win:close")
});

contextBridge.exposeInMainWorld("spotifyControls", {
  openFavoritePlaylist: () => ipcRenderer.invoke("spotify:open-favorite"),
  pause: () => ipcRenderer.invoke("spotify:pause")
});

contextBridge.exposeInMainWorld("desktopControls", {
  openOpera: () => ipcRenderer.invoke("desktop:open-opera")
});