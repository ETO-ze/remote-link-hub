const params = new URLSearchParams(window.location.search);
const requestedRole = params.get("role") || "desktop";

const appState = {
  accessToken: params.get("token") || "",
  role: requestedRole,
  deviceName:
    params.get("name") ||
    (requestedRole === "mobile" ? "Mobile Browser" : `Desktop ${window.location.hostname || "localhost"}`),
  runtime: window.desktopBridge ? "electron" : "browser",
  socket: null,
  controls: [],
};

const ui = {
  roleBadge: document.querySelector("#role-badge"),
  statusBadge: document.querySelector("#status-badge"),
  roomId: document.querySelector("#room-id"),
  desktopUrl: document.querySelector("#desktop-url"),
  mobileUrl: document.querySelector("#mobile-url"),
  remoteUrl: document.querySelector("#remote-url"),
  tailscaleState: document.querySelector("#tailscale-state"),
  qrImage: document.querySelector("#qr-image"),
  qrWrap: document.querySelector("#qr-wrap"),
  deviceList: document.querySelector("#device-list"),
  messageList: document.querySelector("#message-list"),
  messageForm: document.querySelector("#message-form"),
  messageInput: document.querySelector("#message-input"),
  clipboardForm: document.querySelector("#clipboard-form"),
  clipboardInput: document.querySelector("#clipboard-input"),
  copyClipboardButton: document.querySelector("#copy-clipboard-button"),
  uploadForm: document.querySelector("#upload-form"),
  fileInput: document.querySelector("#file-input"),
  fileList: document.querySelector("#file-list"),
  controlList: document.querySelector("#control-list"),
  refreshButton: document.querySelector("#refresh-button"),
  emptyTemplate: document.querySelector("#empty-template"),
};

function setStatus(text, muted = false) {
  ui.statusBadge.textContent = text;
  ui.statusBadge.classList.toggle("muted", muted);
}

function renderEmpty(target) {
  target.innerHTML = "";
  target.appendChild(ui.emptyTemplate.content.cloneNode(true));
}

function renderDevices(devices) {
  if (!devices.length) {
    renderEmpty(ui.deviceList);
    return;
  }

  ui.deviceList.innerHTML = devices
    .map(
      (device) => `
        <li>
          <strong>${escapeHtml(device.deviceName)}</strong>
          <span>${escapeHtml(device.role)}${device.runtime ? ` · ${escapeHtml(device.runtime)}` : ""}</span>
          <small>${formatTime(device.connectedAt)}</small>
        </li>
      `,
    )
    .join("");
}

function renderMessages(messages) {
  if (!messages.length) {
    renderEmpty(ui.messageList);
    return;
  }

  ui.messageList.innerHTML = messages
    .slice()
    .reverse()
    .map(
      (message) => `
        <li>
          <strong>${escapeHtml(message.author)}</strong>
          <p>${escapeHtml(message.content)}</p>
          <small>${formatTime(message.createdAt)}</small>
        </li>
      `,
    )
    .join("");
}

function renderFiles(files) {
  if (!files.length) {
    renderEmpty(ui.fileList);
    return;
  }

  ui.fileList.innerHTML = files
    .map(
      (file) => `
        <li>
          <a href="${file.url}" target="_blank" rel="noreferrer">${escapeHtml(file.originalName)}</a>
          <span>${escapeHtml(file.uploadedBy)}</span>
          <small>${prettySize(file.size)} · ${formatTime(file.uploadedAt)}</small>
        </li>
      `,
    )
    .join("");
}

function renderControls(controls) {
  if (!controls.length) {
    renderEmpty(ui.controlList);
    return;
  }

  ui.controlList.innerHTML = controls
    .filter((control) => appState.role === "mobile" || !control.desktopOnly)
    .map((control) => {
      const input = control.requiresInput
        ? `<input data-control-input="${escapeHtml(control.id)}" placeholder="${escapeHtml(control.placeholder || "")}" />`
        : "";
      return `
        <li>
          <strong>${escapeHtml(control.label)}</strong>
          <span>${escapeHtml(control.description)}</span>
          ${input}
          <button type="button" data-control-action="${escapeHtml(control.id)}">执行</button>
        </li>
      `;
    })
    .join("");
}

function applySnapshot(snapshot) {
  ui.clipboardInput.value = snapshot.clipboard || "";
  appState.controls = snapshot.controls || [];
  renderDevices(snapshot.devices || []);
  renderMessages(snapshot.messages || []);
  renderFiles(snapshot.files || []);
  renderControls(snapshot.controls || []);
}

function sendSocketMessage(type, payload) {
  if (!appState.socket || appState.socket.readyState !== WebSocket.OPEN) {
    setStatus("连接尚未建立", false);
    return;
  }

  appState.socket.send(JSON.stringify({ type, payload }));
}

function connectSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}`;
  const socket = new WebSocket(wsUrl);
  appState.socket = socket;

  socket.addEventListener("open", () => {
    sendSocketMessage("hello", {
      token: appState.accessToken,
      role: appState.role,
      deviceName: appState.deviceName,
      runtime: appState.runtime,
    });
    setStatus("已连接", false);
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "state:sync") {
      applySnapshot(message.payload);
      return;
    }

    if (message.type === "control:result") {
      setStatus(message.payload?.message || "桌面动作已返回", false);
      return;
    }

    if (message.type === "error") {
      setStatus(`错误: ${message.payload}`, false);
    }
  });

  socket.addEventListener("close", () => {
    setStatus("连接已断开，3 秒后重试", true);
    window.setTimeout(connectSocket, 3000);
  });
}

async function bootstrap() {
  const query = new URLSearchParams();
  query.set("role", appState.role);
  if (appState.accessToken) {
    query.set("token", appState.accessToken);
  }

  const response = await fetch(`/api/bootstrap?${query.toString()}`);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Unable to bootstrap.");
  }

  const data = await response.json();
  appState.accessToken = data.accessToken;
  appState.role = data.role;

  ui.roleBadge.textContent = appState.role === "mobile" ? "手机端" : "电脑端";
  ui.roomId.textContent = data.roomId;
  ui.desktopUrl.textContent = data.urls.desktopUrl;
  ui.mobileUrl.textContent = data.urls.mobileUrl;
  ui.remoteUrl.textContent = data.urls.remoteUrl || "登录 Tailscale 后可用";
  ui.tailscaleState.textContent = data.urls.tailscale?.state || "Unknown";
  ui.qrImage.src = data.qrDataUrl;
  ui.qrWrap.hidden = appState.role === "mobile";
  ui.mobileUrl.parentElement.hidden = appState.role === "mobile";

  if (window.desktopBridge?.setServerContext) {
    window.desktopBridge.setServerContext({
      roomId: data.roomId,
      desktopUrl: data.urls.desktopUrl,
      remoteUrl: data.urls.remoteUrl,
    });
  }

  applySnapshot(data.snapshot);
  connectSocket();
  setStatus("准备就绪", false);
}

ui.messageForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const content = ui.messageInput.value.trim();
  if (!content) {
    return;
  }

  sendSocketMessage("message:send", { content });
  ui.messageInput.value = "";
});

ui.clipboardForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sendSocketMessage("clipboard:update", { content: ui.clipboardInput.value });
});

ui.copyClipboardButton.addEventListener("click", async () => {
  try {
    if (window.desktopBridge?.writeClipboard) {
      await window.desktopBridge.writeClipboard(ui.clipboardInput.value);
    } else {
      await navigator.clipboard.writeText(ui.clipboardInput.value);
    }
    setStatus("已复制到当前设备剪贴板", false);
  } catch (_error) {
    setStatus("当前环境拒绝写入剪贴板，请手动复制", false);
  }
});

ui.uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = ui.fileInput.files?.[0];
  if (!file) {
    setStatus("请选择一个文件", false);
    return;
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("token", appState.accessToken);
  formData.append("deviceName", appState.deviceName);

  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    setStatus("文件上传失败", false);
    return;
  }

  ui.uploadForm.reset();
  setStatus("文件上传成功", false);
});

ui.controlList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-control-action]");
  if (!button) {
    return;
  }

  const actionId = button.getAttribute("data-control-action");
  const input = ui.controlList.querySelector(`[data-control-input="${CSS.escape(actionId)}"]`);
  const inputValue = input?.value || "";
  sendSocketMessage("control:request", {
    actionId,
    inputValue,
  });
});

ui.refreshButton.addEventListener("click", () => {
  window.location.reload();
});

bootstrap().catch((error) => {
  setStatus(`初始化失败: ${error.message}`, false);
});

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN", { hour12: false });
}

function prettySize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
