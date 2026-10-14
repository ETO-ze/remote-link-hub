const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { once } = require("node:events");
const { WebSocket } = require("ws");
const { createRemoteLinkServer } = require("../server");

async function fixture(t, options = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "remote-link-test-"));
  const uploadsDir = path.join(temp, "uploads");
  t.mock.method(os, "networkInterfaces", () => ({}));
  const hub = createRemoteLinkServer({ port: 0, host: "127.0.0.1", uploadsDir, ...options });
  t.mock.method(console, "log", () => {});
  const { server, urls } = await hub.listen();
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { Authorization: `Bearer ${hub.state.accessToken}` };
  t.after(async () => {
    await hub.close();
    fs.rmSync(temp, { recursive: true, force: true });
  });
  return { hub, base, headers, uploadsDir, urls };
}

function form(contents = "test file", name = "example.txt") {
  const body = new FormData();
  body.append("file", new Blob([contents]), name);
  body.append("deviceName", "Test browser");
  return body;
}

test("health reveals only liveness", async (t) => {
  const { base } = await fixture(t);
  const response = await fetch(`${base}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("bootstrap requires a token even on loopback and with spoofed forwarding headers", async (t) => {
  const { base } = await fixture(t);
  for (const headers of [
    {},
    { "X-Forwarded-For": "127.0.0.1" },
    { "X-Forwarded-For": "::1" },
    { "X-Forwarded-For": "203.0.113.4, 127.0.0.1" },
    { Forwarded: "for=127.0.0.1", "X-Real-IP": "127.0.0.1" },
  ]) {
    const response = await fetch(`${base}/api/bootstrap`, { headers });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).accessToken, undefined);
  }
  for (const token of ["wrong", "中".repeat(48)]) {
    assert.equal((await fetch(`${base}/api/bootstrap?token=${encodeURIComponent(token)}`)).status, 401);
  }
  assert.equal((await fetch(`${base}/api/bootstrap?token[]=invalid`)).status, 401);
  assert.equal((await fetch(`${base}/api/bootstrap?token=one&token=two`)).status, 401);
});

test("startup links and bearer bootstrap both authenticate; old pairing query remains supported", async (t) => {
  const { hub, base, headers, urls } = await fixture(t);
  for (const [url, expectedRole] of [[urls.desktopUrl, "desktop"], [urls.mobileUrl, "mobile"]]) {
    const parsed = new URL(url);
    assert.equal(Number(parsed.port), Number(new URL(base).port));
    assert.ok(parsed.searchParams.get("token") === hub.state.accessToken);
    const response = await fetch(`${base}/api/bootstrap${parsed.search}`);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.role, expectedRole);
    assert.ok(data.accessToken === hub.state.accessToken);
    assert.match(data.qrDataUrl, /^data:image\/png;base64,/);
  }
  const response = await fetch(`${base}/api/bootstrap?role=mobile`, { headers });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
});

test("unauthorized multipart uploads never create a file, even with a valid body token", async (t) => {
  const { hub, base, uploadsDir } = await fixture(t);
  for (const headers of [{}, { Authorization: "Bearer invalid" }, { "X-Forwarded-For": "127.0.0.1" }]) {
    const body = form();
    body.append("token", hub.state.accessToken);
    const response = await fetch(`${base}/api/upload`, { method: "POST", body, headers });
    assert.equal(response.status, 401);
    assert.deepEqual(fs.readdirSync(uploadsDir), []);
    assert.deepEqual(hub.state.files, []);
  }
});

test("authenticated files download only with a header, as non-executable attachments", async (t) => {
  const { base, headers, uploadsDir } = await fixture(t);
  const html = "<script>alert('test')</script>";
  const response = await fetch(`${base}/api/upload`, { method: "POST", headers, body: form(html, "example.html") });
  assert.equal(response.status, 200);
  const { file } = await response.json();
  assert.equal(fs.readFileSync(path.join(uploadsDir, file.savedName), "utf8"), html);
  assert.equal((await fetch(`${base}${file.url}`)).status, 401);
  assert.equal((await fetch(`${base}${file.url}?token=ignored`)).status, 401);
  const download = await fetch(`${base}${file.url}`, { headers });
  assert.equal(download.status, 200);
  assert.equal(await download.text(), html);
  assert.match(download.headers.get("content-disposition"), /^attachment;/);
  assert.match(download.headers.get("content-type"), /^application\/octet-stream/);
  assert.equal(download.headers.get("x-content-type-options"), "nosniff");
  assert.match(download.headers.get("content-security-policy"), /^sandbox;/);
  assert.equal(download.headers.get("cache-control"), "no-store");

  const second = await fetch(`${base}/api/upload`, { method: "POST", headers, body: form("second", "example.html") });
  assert.equal(second.status, 200);
  assert.notEqual((await second.json()).file.savedName, file.savedName);
});

test("oversized and multiple-file uploads are rejected and cleaned up", async (t) => {
  const { base, headers, uploadsDir, hub } = await fixture(t, { maxUploadBytes: 16 });
  let response = await fetch(`${base}/api/upload`, { method: "POST", headers, body: form("x".repeat(17)) });
  assert.equal(response.status, 413);
  assert.deepEqual(fs.readdirSync(uploadsDir), []);
  const body = form("first");
  body.append("file", new Blob(["second"]), "second.txt");
  response = await fetch(`${base}/api/upload`, { method: "POST", headers, body });
  assert.equal(response.status, 400);
  assert.deepEqual(fs.readdirSync(uploadsDir), []);
  const oversizedField = form("first");
  oversizedField.set("deviceName", "x".repeat(1025));
  response = await fetch(`${base}/api/upload`, { method: "POST", headers, body: oversizedField });
  assert.equal(response.status, 400);
  assert.deepEqual(fs.readdirSync(uploadsDir), []);
  const extraFields = form("first");
  extraFields.append("extra", "second field");
  extraFields.append("another", "third field");
  response = await fetch(`${base}/api/upload`, { method: "POST", headers, body: extraFields });
  assert.equal(response.status, 400);
  assert.deepEqual(fs.readdirSync(uploadsDir), []);
  assert.deepEqual(hub.state.files, []);
});

test("missing files and traversal are rejected", async (t) => {
  const { base, headers } = await fixture(t);
  assert.equal((await fetch(`${base}/api/upload`, { method: "POST", headers, body: new FormData() })).status, 400);
  for (const name of ["..%2Fserver.js", "..%5Cserver.js", ".hidden"]) {
    const response = await fetch(`${base}/uploads/${name}`, { headers });
    assert.equal(response.status, 400);
  }
  assert.equal((await fetch(`${base}/uploads/missing.txt`, { headers })).status, 404);
});

test("WebSocket pairing and shared clipboard still work with the startup token", async (t) => {
  const { base, hub } = await fixture(t);
  const socket = new WebSocket(base.replace("http:", "ws:"));
  t.after(() => socket.terminate());
  await once(socket, "open");
  let incoming = once(socket, "message");
  socket.send(JSON.stringify({ type: "hello", payload: { token: hub.state.accessToken, role: "mobile", deviceName: "Test phone" } }));
  assert.equal(JSON.parse((await incoming)[0]).type, "state:sync");
  incoming = once(socket, "message");
  socket.send(JSON.stringify({ type: "clipboard:update", payload: { content: "isolated fixture" } }));
  const snapshot = JSON.parse((await incoming)[0]);
  assert.equal(snapshot.payload.clipboard, "isolated fixture");
  socket.close();
  await once(socket, "close");
});

test("malformed unauthenticated WebSocket envelopes cannot crash the server", async (t) => {
  const { base } = await fixture(t);
  const socket = new WebSocket(base.replace("http:", "ws:"));
  t.after(() => socket.terminate());
  await once(socket, "open");
  for (const payload of ["null", "[]", "42", "not JSON"]) {
    const incoming = once(socket, "message");
    socket.send(payload);
    assert.equal(JSON.parse((await incoming)[0]).type, "error");
  }
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
  socket.close();
  await once(socket, "close");
});
