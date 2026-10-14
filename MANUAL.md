# Remote Link Hub Manual

## Overview

Remote Link Hub is a Windows desktop and mobile remote interconnect tool for:

- LAN access from a phone browser to the desktop
- Cross-network access with Tailscale
- Real-time messaging
- Shared clipboard sync
- File upload from phone to desktop
- Lightweight desktop actions from the phone
- Windows RDP connectivity through Tailscale

## Project Structure

- `server.js`: Express and WebSocket backend
- `desktop-main.js`: Electron desktop entry
- `desktop-preload.js`: Electron preload bridge
- `public/`: shared browser UI for desktop and mobile
- `scripts/generate-icon.js`: desktop icon generator
- `dist/win-unpacked/Remote Link Hub.exe`: unpacked Windows desktop executable
- `dist/Remote Link Hub Setup 1.0.0.exe`: Windows installer

## Requirements

- Windows desktop
- Node.js 22+
- Optional: Tailscale for cross-network access
- Optional: Windows RDP client on the phone for full remote desktop sessions

## Local Development

```powershell
cd remote-link-hub
npm.cmd install
npm.cmd start
```

Open the complete `Desktop` URL printed by the server, including its per-start token. A bare `http://localhost:4399` URL can load the page but cannot initialize the room. Electron passes the token automatically. Keep connection URLs and QR codes private.

## Windows Desktop App

Run from source:

```powershell
npm.cmd run desktop
```

Build the Windows installer:

```powershell
$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://mirrors.huaweicloud.com/electron-builder-binaries/'
npm.cmd run dist
```

Build outputs:

- `dist\Remote Link Hub Setup 1.0.0.exe`
- `dist\win-unpacked\Remote Link Hub.exe`

## Phone Access

### Same LAN

1. Start the desktop app or local server.
2. Open the desktop page.
3. Scan the QR code with the phone.
4. Or manually open the `手机地址` shown in the UI.

### Cross-Network with Tailscale

1. Install Tailscale on both desktop and phone.
2. Log both into the same tailnet.
3. Start Remote Link Hub on the desktop.
4. On the phone, open the `Tailscale 远程地址` shown in the desktop UI.

Use the Tailscale address detected on your own machine. Do not directly expose the HTTP service to the public internet; use a trusted encrypted tunnel or an appropriately configured HTTPS/WSS deployment.

## Remote Controls

The mobile UI currently supports:

- Write the shared clipboard text into the Windows desktop clipboard
- Open the uploads folder on the desktop
- Bring the desktop app window to the front
- Open a URL in the default desktop browser

## File Uploads

- Browser mode stores uploads in the local project `uploads` folder
- Electron desktop mode stores uploads under the app user-data folder
- Uploads require an `Authorization: Bearer <token>` header before multipart parsing; a token in the form body alone is no longer accepted
- The default limit is one file per request and 25 MiB per file; rejected multipart uploads are cleaned up
- Downloads under `/uploads/:filename` require the same header and are served as attachments, including HTML/SVG; use the updated UI to download
- The limit is per request, not a total storage quota; manage old files on the host as needed

## Windows RDP via Tailscale

RDP is a separate Windows feature, not configured by this application. If you choose to use it, configure Windows and tailnet access controls yourself and connect using your own machine address and account. Never publish machine credentials or assume RDP is enabled.

## Security Migration and Tests

See [the README security notes](README.md#安全与兼容性变更) for API migration, token handling, test commands, and verification limits. `/api/health` now returns only liveness. Every bootstrap request needs a token, including loopback and proxy requests.

These source changes do not update an existing deployment or EXE. Rebuild/restart separately after review to apply the changes.

## GitHub Publishing

If GitHub CLI is logged in, create and push a repo with:

```powershell
gh repo create remote-link-hub --public --source . --remote origin --push
```

If you prefer an existing repository:

```powershell
git remote add origin <your-repo-url>
git push -u origin main
```
