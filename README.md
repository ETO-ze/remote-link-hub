# Remote Link Hub

一个局域网优先的远程互联 MVP：

- 电脑端在本机启动服务
- 手机端直接用浏览器扫码接入
- 支持即时消息
- 支持共享剪贴板
- 支持手机向电脑上传文件

## 适用网络环境

当前这台电脑可用的局域网 IPv4 是 `192.168.3.46`，所以同一 Wi-Fi 或同一局域网内的手机可直接访问：

- 电脑端：`http://localhost:4399`
- 手机端：启动后扫描页面二维码，或手动打开控制台打印出的手机地址

这个版本默认不走公网中继，适合你现在的内网环境。如果后续要跨公网，可以继续在这个基础上接入：

- 路由器端口映射
- Tailscale / ZeroTier
- HTTPS 反向代理
- WebRTC 中继

## Tailscale 跨网模式

我已经在这台 Windows 机器上安装了 Tailscale `1.96.3`，但当前状态还是 `NeedsLogin`，也就是还没有登录到 tailnet。

根据 Tailscale 官方 Windows 安装文档，安装完成后需要在系统托盘里打开 Tailscale 并执行登录；官方文档还说明 MagicDNS 会给 tailnet 中的设备自动分配可访问的 DNS 名称。来源：

- [Install Tailscale on Windows](https://tailscale.com/docs/install/windows)
- [MagicDNS](https://tailscale.com/kb/1081/magicdns/)
- [What is Tailscale?](https://tailscale.com/docs/concepts/what-is-tailscale)

登录完成后：

1. 电脑端保持 `remote-link-hub` 运行
2. 手机安装 Tailscale 并登录同一个账号或同一个 tailnet
3. 打开电脑端页面 `http://localhost:4399`
4. 页面里的 `Tailscale 远程地址` 会变成可访问的跨网地址
5. 手机上直接打开那个地址即可，不要求与电脑处于同一个 Wi‑Fi

如果你更偏好命令行，也可以尝试：

```powershell
& "C:\Program Files\Tailscale\tailscale.exe" up
```

通常第一次登录会拉起浏览器进行认证。

## 启动

```powershell
cd C:\Users\Administrator\Documents\Playground\remote-link-hub
npm.cmd install
npm.cmd start
```

启动后控制台会打印：

- 本机桌面入口
- 手机浏览器入口
- 房间 ID

也可以直接双击：

- `Start Remote Link Hub.cmd`
- `start-remote-link-hub.ps1`

## Windows 桌面端

项目现在已经支持 Electron 桌面端，源码模式可直接运行：

```powershell
cd C:\Users\Administrator\Documents\Playground\remote-link-hub
npm.cmd run desktop
```

已验证可运行的桌面 `exe` 在：

- `C:\Users\Administrator\Documents\Playground\remote-link-hub\dist\win-unpacked\Remote Link Hub.exe`

这个 `exe` 会自动：

- 启动本地服务
- 打开桌面窗口
- 作为 `desktop-app` 接入房间
- 接收手机端发起的远程桌面动作

说明：

- 目前 `win-unpacked` 版已经验证可用
- NSIS 安装器打包会因为当前网络拉取 `electron-builder` 的 NSIS 资源超时而中断
- 所以当前最稳的 Windows 交付物是上面的 `Remote Link Hub.exe`

## 使用方式

1. 在电脑浏览器打开 `http://localhost:4399`
2. 用手机扫描页面二维码
3. 手机端接入后，就可以：
   - 发送消息到电脑端
   - 同步文本到共享剪贴板
   - 上传文件到电脑的 `uploads` 目录
   - 触发桌面端动作

## 远程控制

当前已经实现一批安全边界清晰的桌面动作：

- 把共享剪贴板写入 Windows 剪贴板
- 打开上传文件夹
- 唤起桌面窗口
- 让电脑默认浏览器打开指定网页

其中上传文件会保存到桌面端用户数据目录下的 `uploads` 文件夹。

## 目录

- `server.js`：Node 服务端与 WebSocket 实时通道
- `public/`：桌面端与手机端共用前端
- `uploads/`：上传文件保存目录

## 后续可扩展

如果你希望把它继续做成真正的“远程控制程序”，下一步可以继续加：

- 电脑屏幕预览
- 手机触控映射到电脑操作
- 远程命令执行白名单
- 摄像头/麦克风通道
- 端到端加密配对

当前提交的是一个可运行、可扩展、对现有网络环境友好的第一版。
