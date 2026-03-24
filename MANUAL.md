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
cd C:\Users\Administrator\Documents\Playground\remote-link-hub
npm.cmd install
npm.cmd start
```

Desktop browser entry:

```text
http://localhost:4399
```

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

Current verified desktop Tailscale IP in this environment:

```text
100.104.255.57
```

## Remote Controls

The mobile UI currently supports:

- Write the shared clipboard text into the Windows desktop clipboard
- Open the uploads folder on the desktop
- Bring the desktop app window to the front
- Open a URL in the default desktop browser

## File Uploads

- Browser mode stores uploads in the local project `uploads` folder
- Electron desktop mode stores uploads under the app user-data folder

## Windows RDP via Tailscale

This machine has RDP enabled and listening on port `3389`.

Use a phone RDP client like Microsoft Windows App and connect to:

```text
100.104.255.57
```

Username:

```text
Administrator
```

Or:

```text
WIN-4QA328LBHF6\Administrator
```

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
