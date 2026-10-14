# Remote Link Hub

一个局域网优先的远程互联 MVP：

- 电脑端在本机启动服务
- 手机端直接用浏览器扫码接入
- 支持即时消息
- 支持共享剪贴板
- 支持手机向电脑上传文件

## 适用网络环境

运行时会自动选择局域网 IPv4。同一 Wi-Fi 或同一局域网内的手机可使用启动时生成的连接地址：

- 电脑端：使用控制台 `Desktop` 行打印的完整地址（包含本次启动的 token）
- 手机端：启动后扫描页面二维码，或手动打开控制台打印出的手机地址

这个版本默认不走公网中继，仍是单房间共享 token 的 MVP。跨网络优先使用受控的 Tailscale / ZeroTier 网络；不要直接向公网做端口映射。HTTP 不加密，非可信网络需要 HTTPS/WSS 或受控加密隧道。

## Tailscale 跨网模式

Tailscale 是可选组件，需自行安装并登录；页面显示的是运行时检测到的状态。

根据 Tailscale 官方 Windows 安装文档，安装完成后需要在系统托盘里打开 Tailscale 并执行登录；官方文档还说明 MagicDNS 会给 tailnet 中的设备自动分配可访问的 DNS 名称。来源：

- [Install Tailscale on Windows](https://tailscale.com/docs/install/windows)
- [MagicDNS](https://tailscale.com/kb/1081/magicdns/)
- [What is Tailscale?](https://tailscale.com/docs/concepts/what-is-tailscale)

登录完成后：

1. 电脑端保持 `remote-link-hub` 运行
2. 手机安装 Tailscale 并登录同一个账号或同一个 tailnet
3. 打开控制台 `Desktop` 行的完整带 token 地址，或使用 Electron 桌面端
4. 页面里的 `Tailscale 远程地址` 会变成可访问的跨网地址
5. 手机上直接打开那个地址即可，不要求与电脑处于同一个 Wi‑Fi

如果你更偏好命令行，也可以尝试：

```powershell
& "C:\Program Files\Tailscale\tailscale.exe" up
```

通常第一次登录会拉起浏览器进行认证。

## 启动

```powershell
cd remote-link-hub
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
cd remote-link-hub
npm.cmd run desktop
```

执行 `npm.cmd run dist` 后，Windows 构建输出位于 `dist` 目录。构建需要网络下载 Electron/NSIS 资源；本次安全补丁未做 Windows 打包验收。

这个 `exe` 会自动：

- 启动本地服务
- 打开桌面窗口
- 作为 `desktop-app` 接入房间
- 接收手机端发起的远程桌面动作

## 使用方式

1. 在电脑浏览器打开控制台 `Desktop` 行打印的完整地址，或启动 Electron 桌面端
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

## 安全与兼容性变更

- 所有初始化请求都需要本次启动生成的 token，localhost 和代理请求也不例外。仅打开 `http://localhost:4399` 会显示初始化失败；请使用控制台完整地址。Electron 会自动携带 token。
- 二维码和连接地址等同房间访问凭证，可访问消息、剪贴板、文件和已接入的桌面动作。只分享给信任的人，勿把控制台日志、二维码或地址上传到公开位置。重启会生成新 token，旧连接地址失效。
- `/api/health` 只返回 `{ "ok": true }`，不再返回连接地址或设备信息。
- `POST /api/upload` 必须在请求头发送 `Authorization: Bearer <token>`，并在 multipart 表单中发送 `file` 和可选 `deviceName`。仅在表单里传 token 的旧客户端需更新；验证在写入文件前进行。
- 文件默认限制为 25 MiB、每次 1 个；可通过代码选项 `maxUploadBytes` 调整。超限返回 413，其他 multipart 限制错误返回 400；这不是总磁盘配额，仍需定期清理文件。
- `/uploads/:filename` 不再公开可读，也需要同样的 Authorization 请求头。请从更新后的页面下载；旧的裸下载链接需改为带鉴权的请求。HTML/SVG 等均作为附件下载，不在应用页面内执行。
- 旧版带 token 查询参数的 `/api/bootstrap` 仍兼容。新版页面的 API 请求使用 Authorization 请求头；API 和下载响应禁止缓存，并使用 no-referrer 降低连接地址外泄风险。
- 合并代码不会更新既有 EXE、部署或运行中的服务；需要由维护者重新构建并重启，才会使用修复后的代码。

## 测试

需要 Node.js 22 或更高版本。仅验证服务端时可跳过 Electron 安装脚本：

```sh
npm ci --omit=dev --ignore-scripts
npm test
```

测试仅使用临时目录、内存生成的测试 token 和本机回环端口；网络接口查询被替换为测试数据。覆盖鉴权、伪造转发头、未授权上传不落盘、超限清理、附件下载、WebSocket 消息、浏览器请求流程及模拟 Electron 启动。真实 Windows 界面、安装包、HTTPS/代理部署和移动浏览器下载仍需另行验收。

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

当前仍是 MVP；测试覆盖不等于完整安全审计，也不代表现有安装或运行中的服务已经更新。
