const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopBridge", {
  writeClipboard(text) {
    return ipcRenderer.invoke("desktop:writeClipboard", text);
  },
  setServerContext(context) {
    return ipcRenderer.invoke("desktop:setServerContext", context);
  },
  getServerContext() {
    return ipcRenderer.invoke("desktop:getServerContext");
  },
});
