const { app, BrowserWindow, clipboard, ipcMain, shell, nativeImage } = require("electron");
const path = require("path");
const { createRemoteLinkServer } = require("./server");

let mainWindow;
let serverHandle;
let latestContext = {};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 920,
    minWidth: 1080,
    minHeight: 760,
    title: "Remote Link Hub",
    icon: path.join(__dirname, "public", "favicon.png"),
    webPreferences: {
      preload: path.join(__dirname, "desktop-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL("http://localhost:4399/?role=desktop&name=Windows%20Desktop%20App");
}

async function startDesktopApp() {
  serverHandle = createRemoteLinkServer({
    publicDir: path.join(__dirname, "public"),
    uploadsDir: path.join(app.getPath("userData"), "uploads"),
    desktopController: {
      async performAction(actionId, payload) {
        if (actionId === "desktop.copyClipboard") {
          clipboard.writeText(payload.text || "");
          return { ok: true, message: "共享剪贴板已写入 Windows 剪贴板。" };
        }

        if (actionId === "desktop.openUploads") {
          await shell.openPath(payload.uploadsDir);
          return { ok: true, message: "已在桌面端打开上传文件夹。" };
        }

        if (actionId === "desktop.revealApp") {
          if (mainWindow) {
            if (mainWindow.isMinimized()) {
              mainWindow.restore();
            }
            mainWindow.show();
            mainWindow.focus();
          }
          return { ok: true, message: "桌面窗口已唤起。" };
        }

        if (actionId === "desktop.openUrl") {
          const value = String(payload.url || "").trim();
          if (!/^https?:\/\//i.test(value)) {
            return { ok: false, message: "只允许打开 http 或 https 链接。" };
          }
          await shell.openExternal(value);
          return { ok: true, message: `桌面端已尝试打开 ${value}` };
        }

        return { ok: false, message: `未支持的桌面动作: ${actionId}` };
      },
    },
  });

  await serverHandle.listen();
  createWindow();
}

app.whenReady().then(async () => {
  if (!nativeImage.createFromPath(path.join(__dirname, "public", "favicon.png")).isEmpty()) {
    app.dock?.setIcon?.(path.join(__dirname, "public", "favicon.png"));
  }

  await startDesktopApp();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

ipcMain.handle("desktop:writeClipboard", async (_event, text) => {
  clipboard.writeText(String(text || ""));
  return true;
});

ipcMain.handle("desktop:setServerContext", async (_event, context) => {
  latestContext = context || {};
  if (mainWindow) {
    mainWindow.setTitle(`Remote Link Hub - ${latestContext.roomId || "desktop"}`);
  }
  return true;
});

ipcMain.handle("desktop:getServerContext", async () => latestContext);

app.on("window-all-closed", async () => {
  if (serverHandle) {
    await serverHandle.close().catch(() => {});
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});
