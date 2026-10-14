const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { createRemoteLinkServer } = require("../server");

// Exercise real HTTP routes with a minimal DOM, without launching Electron,
// reading machine network settings, or contacting anything outside loopback.
test("browser bootstraps, uploads, and downloads using header authentication", async (t) => {
  t.mock.method(os, "networkInterfaces", () => ({}));
  t.mock.method(console, "log", () => {});
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "remote-link-client-"));
  const hub = createRemoteLinkServer({ port: 0, host: "127.0.0.1", uploadsDir: temp });
  const { server, urls } = await hub.listen();
  t.after(async () => { await hub.close(); fs.rmSync(temp, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const elements = new Map();
  const downloads = [];
  const requests = [];
  let ready;
  const bootstrapped = new Promise((resolve) => { ready = resolve; });
  function element() {
    return {
      innerHTML: "", textContent: "", value: "", hidden: false, parentElement: {},
      classList: { toggle() {} }, listeners: {}, content: { cloneNode() { return {}; } },
      addEventListener(type, listener) { this.listeners[type] = listener; },
      appendChild() {}, reset() {}, remove() {},
      click() { downloads.push(this); },
    };
  }
  const document = {
    body: element(),
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, element());
      return elements.get(selector);
    },
    createElement: element,
  };
  Object.defineProperty(document.querySelector("#status-badge"), "textContent", {
    set(value) { if (value === "准备就绪") ready(); },
  });
  class SocketStub {
    static OPEN = 1;
    constructor(url) { this.url = url; }
    addEventListener() {}
  }
  const context = vm.createContext({
    document, URL, URLSearchParams, FormData, WebSocket: SocketStub,
    window: { location: new URL(`${base}${new URL(urls.desktopUrl).search}`), setTimeout() {} },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return fetch(new URL(url, base), options);
    },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8"), context);
  await bootstrapped;
  assert.ok(requests[0].options.headers.Authorization === `Bearer ${hub.state.accessToken}`);
  assert.ok(!requests[0].url.includes("token="));
  document.querySelector("#file-input").files = [new Blob(["browser fixture"] )];
  await document.querySelector("#upload-form").listeners.submit({ preventDefault() {} });
  assert.equal(hub.state.files.length, 1);
  assert.equal(requests[1].options.body.get("token"), null);
  assert.ok(requests[1].options.headers.Authorization === `Bearer ${hub.state.accessToken}`);
  const file = hub.state.files[0];
  const link = { getAttribute(name) { return name === "href" ? file.url : file.originalName; } };
  await document.querySelector("#file-list").listeners.click({
    target: { closest() { return link; } }, preventDefault() {},
  });
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].download, file.originalName);
  assert.equal(await (await fetch(downloads[0].href)).text(), "browser fixture");
  URL.revokeObjectURL(downloads[0].href);
  assert.ok(requests[2].options.headers.Authorization === `Bearer ${hub.state.accessToken}`);
});

test("Electron opens the authenticated server URL and preserves the configured port", async () => {
  let loaded;
  const startupUrl = "http://localhost:45678/?role=desktop&token=isolated-test-value";
  const handlers = {};
  let ready;
  const started = new Promise((resolve, reject) => { ready = { resolve, reject }; });
  const electron = {
    app: {
      whenReady: () => ({ then(callback) { callback().then(ready.resolve, ready.reject); } }),
      on(name, callback) { handlers[name] = callback; }, getPath() { return "/tmp/isolated-electron"; },
    },
    BrowserWindow: class {
      constructor() { this.setTitle = () => {}; }
      loadURL(url) { loaded = url; }
    },
    nativeImage: { createFromPath() { return { isEmpty: () => true }; } },
    clipboard: {}, shell: {}, ipcMain: { handle() {} },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../desktop-main.js"), "utf8"), {
    __dirname: path.join(__dirname, ".."), URL, process: { platform: "win32" },
    require(name) {
      if (name === "electron") return electron;
      if (name === "path") return path;
      if (name === "./server") return { createRemoteLinkServer: () => ({
        listen: async () => {}, getUrls: () => ({ desktopUrl: startupUrl }),
      }) };
      throw new Error(`Unexpected module: ${name}`);
    },
  });
  await started;
  const url = new URL(loaded);
  assert.equal(url.port, "45678");
  assert.equal(url.searchParams.get("token"), "isolated-test-value");
  assert.equal(url.searchParams.get("name"), "Windows Desktop App");
});
