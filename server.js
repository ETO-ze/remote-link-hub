const express = require("express");
const { execFileSync } = require("child_process");
const fs = require("fs");
const http = require("http");
const multer = require("multer");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const QRCode = require("qrcode");
const { WebSocketServer } = require("ws");

function createRemoteLinkServer(options = {}) {
  const app = express();
  const port = Number(options.port || process.env.PORT || 4399);
  const baseDir = options.baseDir || __dirname;
  const uploadsDir = options.uploadsDir || path.join(baseDir, "uploads");
  const publicDir = options.publicDir || path.join(baseDir, "public");
  const desktopController = options.desktopController || {};

  fs.mkdirSync(uploadsDir, { recursive: true });

  const state = {
    roomId: `desk-${os.hostname().toLowerCase()}`,
    accessToken: crypto.randomBytes(24).toString("hex"),
    startedAt: new Date().toISOString(),
    clipboard: "",
    messages: [],
    files: [],
    devices: new Map(),
  };

  const storage = multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadsDir),
    filename: (_req, file, callback) => {
      const safeBase = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, "_");
      callback(null, `${Date.now()}-${safeBase}`);
    },
  });

  const upload = multer({ storage });

  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use("/uploads", express.static(uploadsDir));
  app.use(express.static(publicDir));

  function getLanAddress() {
    const interfaces = os.networkInterfaces();
    const preferred = [];
    const fallback = [];

    for (const [name, addresses] of Object.entries(interfaces)) {
      const normalizedName = name.toLowerCase();
      const isVirtualAdapter =
        normalizedName.includes("vmware") ||
        normalizedName.includes("vethernet") ||
        normalizedName.includes("virtual") ||
        normalizedName.includes("hyper-v") ||
        normalizedName.includes("wsl") ||
        normalizedName.includes("loopback");

      for (const address of addresses || []) {
        if (address.family !== "IPv4" || address.internal) {
          continue;
        }

        if (
          address.address.startsWith("192.168.") ||
          address.address.startsWith("10.") ||
          /^172\.(1[6-9]|2\d|3[0-1])\./.test(address.address)
        ) {
          if (isVirtualAdapter) {
            fallback.push(address.address);
          } else {
            preferred.push(address.address);
          }
        }
      }
    }

    return preferred[0] || fallback[0] || "127.0.0.1";
  }

  function getTailscaleInfo() {
    const cliPath = "C:\\Program Files\\Tailscale\\tailscale.exe";
    if (!fs.existsSync(cliPath)) {
      return {
        installed: false,
        loggedIn: false,
        state: "NotInstalled",
        ipv4: null,
        magicDnsName: null,
      };
    }

    try {
      const raw = execFileSync(cliPath, ["status", "--json"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 5000,
      });
      const status = JSON.parse(raw);
      const self = status.Self || {};
      const tailscaleIps = Array.isArray(self.TailscaleIPs) ? self.TailscaleIPs : [];
      const ipv4 = tailscaleIps.find((ip) => /^\d+\.\d+\.\d+\.\d+$/.test(ip)) || null;

      return {
        installed: true,
        loggedIn: true,
        state: status.BackendState || "Running",
        ipv4,
        magicDnsName: self.DNSName ? String(self.DNSName).replace(/\.$/, "") : null,
      };
    } catch (error) {
      const stderr = String(error.stderr || "");
      const needsLogin = stderr.includes("Logged out") || stderr.includes("NeedsLogin");

      return {
        installed: true,
        loggedIn: false,
        state: needsLogin ? "NeedsLogin" : "Unavailable",
        ipv4: null,
        magicDnsName: null,
      };
    }
  }

  function isLocalRequest(req) {
    const forwarded = req.headers["x-forwarded-for"];
    const remoteAddress = forwarded || req.socket.remoteAddress || "";
    return (
      remoteAddress.includes("127.0.0.1") ||
      remoteAddress.includes("::1") ||
      remoteAddress.includes("::ffff:127.0.0.1")
    );
  }

  function getUrls() {
    const lanAddress = getLanAddress();
    const tailscale = getTailscaleInfo();
    const tailscaleBaseUrl = tailscale.ipv4
      ? `http://${tailscale.ipv4}:${port}`
      : tailscale.magicDnsName
        ? `http://${tailscale.magicDnsName}:${port}`
        : null;

    return {
      lanAddress,
      tailscale,
      desktopUrl: `http://localhost:${port}`,
      mobileUrl: `http://${lanAddress}:${port}/?role=mobile&token=${state.accessToken}`,
      remoteUrl: tailscaleBaseUrl
        ? `${tailscaleBaseUrl}/?role=mobile&token=${state.accessToken}`
        : null,
    };
  }

  function controlCatalog() {
    return [
      {
        id: "desktop.copyClipboard",
        label: "同步共享剪贴板到桌面",
        description: "把当前房间里的共享文本写入 Windows 桌面剪贴板",
        desktopOnly: true,
      },
      {
        id: "desktop.openUploads",
        label: "打开上传文件夹",
        description: "在电脑上直接打开 uploads 文件夹",
        desktopOnly: true,
      },
      {
        id: "desktop.revealApp",
        label: "唤起桌面窗口",
        description: "把 Windows 客户端窗口拉到前台",
        desktopOnly: true,
      },
      {
        id: "desktop.openUrl",
        label: "让电脑打开网页",
        description: "在桌面默认浏览器中打开指定链接",
        desktopOnly: true,
        requiresInput: true,
        inputLabel: "网页地址",
        placeholder: "https://example.com",
      },
    ];
  }

  function createSnapshot() {
    return {
      roomId: state.roomId,
      startedAt: state.startedAt,
      clipboard: state.clipboard,
      messages: state.messages,
      files: state.files,
      controls: controlCatalog(),
      devices: Array.from(state.devices.values()).sort((a, b) => a.connectedAt.localeCompare(b.connectedAt)),
    };
  }

  let wss;

  function broadcast(type, payload) {
    const message = JSON.stringify({ type, payload });
    for (const client of wss.clients) {
      if (client.readyState === 1 && client.isAuthorized) {
        client.send(message);
      }
    }
  }

  function broadcastState() {
    broadcast("state:sync", createSnapshot());
  }

  function addMessage(entry) {
    state.messages = [...state.messages, entry].slice(-60);
  }

  async function executeDesktopAction(actionId, inputValue, requesterName) {
    if (!desktopController || typeof desktopController.performAction !== "function") {
      return {
        ok: false,
        message: "当前运行的是网页服务，尚未连接 Windows 桌面客户端。",
      };
    }

    if (actionId === "desktop.copyClipboard") {
      return desktopController.performAction(actionId, { text: state.clipboard });
    }

    if (actionId === "desktop.openUploads") {
      return desktopController.performAction(actionId, { uploadsDir });
    }

    if (actionId === "desktop.revealApp") {
      return desktopController.performAction(actionId, {});
    }

    if (actionId === "desktop.openUrl") {
      return desktopController.performAction(actionId, { url: String(inputValue || "").trim() });
    }

    return {
      ok: false,
      message: `未知动作: ${actionId}`,
    };
  }

  app.get("/api/bootstrap", async (req, res) => {
    const { role = "desktop", token = "" } = req.query;
    const urls = getUrls();

    if (!isLocalRequest(req) && token !== state.accessToken) {
      return res.status(401).json({
        error: "Unauthorized request. Please use the mobile URL from the desktop page or console.",
      });
    }

    const qrDataUrl = await QRCode.toDataURL(urls.mobileUrl, {
      margin: 1,
      width: 320,
    });

    return res.json({
      roomId: state.roomId,
      role: role === "mobile" ? "mobile" : "desktop",
      accessToken: state.accessToken,
      urls,
      qrDataUrl,
      snapshot: createSnapshot(),
    });
  });

  app.post("/api/upload", upload.single("file"), (req, res) => {
    const { token = "", deviceName = "Unknown device" } = req.body;
    if (token !== state.accessToken) {
      return res.status(401).json({ error: "Invalid token." });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    const fileRecord = {
      id: crypto.randomUUID(),
      originalName: req.file.originalname,
      savedName: req.file.filename,
      size: req.file.size,
      uploadedAt: new Date().toISOString(),
      uploadedBy: deviceName,
      url: `/uploads/${encodeURIComponent(req.file.filename)}`,
    };

    state.files = [fileRecord, ...state.files].slice(0, 30);
    addMessage({
      id: crypto.randomUUID(),
      kind: "system",
      author: "system",
      content: `${deviceName} 上传了文件 ${req.file.originalname}`,
      createdAt: new Date().toISOString(),
    });
    broadcastState();

    return res.json({ ok: true, file: fileRecord });
  });

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      ...getUrls(),
      roomId: state.roomId,
      devices: state.devices.size,
    });
  });

  const server = http.createServer(app);
  wss = new WebSocketServer({ server });

  wss.on("connection", (socket) => {
    socket.isAuthorized = false;
    socket.deviceId = crypto.randomUUID();

    socket.on("message", async (raw) => {
      let data;
      try {
        data = JSON.parse(raw.toString());
      } catch (_error) {
        socket.send(JSON.stringify({ type: "error", payload: "Invalid JSON payload." }));
        return;
      }

      if (data.type === "hello") {
        const { token, role = "desktop", deviceName = "Unknown device", runtime = "browser" } = data.payload || {};
        if (token !== state.accessToken) {
          socket.send(JSON.stringify({ type: "error", payload: "Authentication failed." }));
          socket.close();
          return;
        }

        socket.isAuthorized = true;
        const device = {
          id: socket.deviceId,
          role,
          runtime,
          deviceName,
          connectedAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        };
        state.devices.set(socket.deviceId, device);
        addMessage({
          id: crypto.randomUUID(),
          kind: "system",
          author: "system",
          content: `${deviceName} 已连接 (${role}${runtime === "electron" ? ", desktop-app" : ""})`,
          createdAt: new Date().toISOString(),
        });
        broadcastState();
        return;
      }

      if (!socket.isAuthorized) {
        socket.send(JSON.stringify({ type: "error", payload: "Please authenticate first." }));
        return;
      }

      const device = state.devices.get(socket.deviceId);
      if (device) {
        device.lastSeenAt = new Date().toISOString();
        state.devices.set(socket.deviceId, device);
      }

      if (data.type === "message:send") {
        const content = String(data.payload?.content || "").trim();
        if (!content) {
          return;
        }

        addMessage({
          id: crypto.randomUUID(),
          kind: "chat",
          author: device?.deviceName || "Unknown device",
          role: device?.role || "unknown",
          content,
          createdAt: new Date().toISOString(),
        });
        broadcastState();
        return;
      }

      if (data.type === "clipboard:update") {
        state.clipboard = String(data.payload?.content || "");
        addMessage({
          id: crypto.randomUUID(),
          kind: "system",
          author: "system",
          content: `${device?.deviceName || "Unknown device"} 更新了共享剪贴板`,
          createdAt: new Date().toISOString(),
        });
        broadcastState();
        return;
      }

      if (data.type === "control:request") {
        const actionId = String(data.payload?.actionId || "");
        const inputValue = data.payload?.inputValue || "";
        const result = await executeDesktopAction(actionId, inputValue, device?.deviceName || "Unknown device");

        addMessage({
          id: crypto.randomUUID(),
          kind: result.ok ? "system" : "warning",
          author: "system",
          content: result.ok
            ? `${device?.deviceName || "Unknown device"} 执行了桌面动作: ${actionId}`
            : `${device?.deviceName || "Unknown device"} 执行动作失败: ${result.message}`,
          createdAt: new Date().toISOString(),
        });
        broadcast("control:result", {
          actionId,
          ok: result.ok,
          message: result.message,
        });
        broadcastState();
      }
    });

    socket.on("close", () => {
      if (state.devices.has(socket.deviceId)) {
        const device = state.devices.get(socket.deviceId);
        state.devices.delete(socket.deviceId);
        addMessage({
          id: crypto.randomUUID(),
          kind: "system",
          author: "system",
          content: `${device?.deviceName || "Unknown device"} 已断开`,
          createdAt: new Date().toISOString(),
        });
        broadcastState();
      }
    });
  });

  function listen() {
    return new Promise((resolve) => {
      server.listen(port, () => {
        const urls = getUrls();
        console.log("");
        console.log("Remote Link Hub is running.");
        console.log(`Desktop: ${urls.desktopUrl}`);
        console.log(`Mobile : ${urls.mobileUrl}`);
        if (urls.remoteUrl) {
          console.log(`Remote : ${urls.remoteUrl}`);
        }
        console.log(`Room   : ${state.roomId}`);
        console.log("");
        resolve({ server, urls, state });
      });
    });
  }

  function close() {
    return new Promise((resolve, reject) => {
      wss.close(() => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    });
  }

  return {
    app,
    state,
    getUrls,
    createSnapshot,
    listen,
    close,
    uploadsDir,
  };
}

if (require.main === module) {
  createRemoteLinkServer().listen();
}

module.exports = {
  createRemoteLinkServer,
};
