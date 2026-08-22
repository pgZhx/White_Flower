# Rose & Blade Online

5–10 人浏览器实时联机隐藏身份桌游 MVP。

当前实现采用 Vite + React 前端、浏览器房主权威 Game Engine，以及 WebSocket Relay 联机。游戏桌面使用圆桌式 UI：玩家座位环、白蔷薇/血刃状态、当前行动、金币和顶部三张手牌均在桌面内呈现。

## 环境与使用约束

- 当前服务器为**个人腾讯云轻量服务器**。
- 当前用户拥有 **sudo 权限**，可以安装系统级依赖，不再受共享实验室服务器限制。
- 历史开发记录：项目早期曾在导师实验室服务器上开发，相关旧限制已失效。
- 本项目目录以外的系统级操作仍建议谨慎执行，并保留必要确认流程。
- 详细部署与环境说明见 `docs/DEPLOYMENT.md`、`docs/PROJECT_POLICY.md`。

## 已确认规则

- 6 人局胜利阈值最终使用：**4 / 4**。

## 当前实现范围

- 独立 Game Engine（TypeScript / strict）
- 规则配置化
- 浏览器房主权威、隐藏信息投影
- WebSocket Relay 多浏览器联机
- Vite + React 游戏桌面与响应式手牌区
- Vitest 规则测试

## 本地命令

```bash
# 安装依赖（在项目根目录）
npm install

# 运行 Game Engine 测试
npm test

# 类型检查
npm run typecheck

# 构建 Web 前端
npm run build:web
```

## 目录

- `docs/RULES.md`：整理后的规则
- `docs/ARCHITECTURE.md`：架构说明
- `docs/RULES_UNCERTAINTIES.md`：待确认规则
- `docs/DEPLOYMENT.md`：部署架构与环境说明
- `docs/PROJECT_POLICY.md`：项目操作规范
- `docs/FRONTEND_MIGRATION_ANALYSIS.md`：纯前端多人桌游迁移分析
- `packages/game-engine`：独立游戏引擎
- `packages/p2p-network`：Relay / Local / WebRTC Transport 与网络协议
- `packages/web-client`：Vite + React 游戏客户端
- `server/relay-server.mjs`：轻量 WebSocket Relay


## Development

### Frontend Development

```bash
npm install
npm run dev:web
```

打开 http://localhost:5173 。

### Local Relay Multiplayer Development

需要真实多浏览器联机时，先启动 Relay，再启动前端：

Terminal A：

```bash
npm run dev:relay
```

Terminal B：

```bash
npm run dev:web
```

然后打开 `http://localhost:5173` 创建房间，并用另一个浏览器/无痕窗口加入。

### Run Tests

```bash
npm test
npm run typecheck
```

### Build Static Site

```bash
npm run build:web
```

产物位于：

```text
packages/web-client/dist/
```

该目录可直接交给任意静态 HTTP Server / Vercel / Cloudflare Pages / GitHub Pages / Nginx 托管。

### Browser Multiplayer (WebSocket Relay + WebRTC Voice)

当前生产联机的游戏状态使用轻量 WebSocket Relay；房间语音使用浏览器 WebRTC：

1. 房主打开公网地址并创建房间。
2. 获得邀请链接 `https://域名/?room=AB7K2P`。
3. 朋友在任意网络打开链接，输入昵称加入。
4. 5–10 人进入同一 Lobby，全员 Ready 后由房主开始游戏。
5. 每个玩家只看到自己的身份、手牌、水晶与私人信息。

- 房主浏览器是 authoritative host，持有完整 GameState 与唯一 GameEngine。
- 普通玩家只发送命令，并接收自己的 PlayerView。
- Relay 只负责转发消息，不运行 GameEngine、不理解游戏规则。
- Relay 同时转发语音 SDP/ICE 信令，但不承载音频；跨运营商网络的音频需要 TURN。
- 通信层通过 `packages/p2p-network` 抽象，支持 LocalTransport、WebSocket Relay Transport，以及 WebRTC fallback。
- 生产环境使用 Nginx 代理 `/relay` 到本机 `127.0.0.1:9001`。
- 详见 `docs/P2P_NETWORKING.md`。

生产构建前应在 `packages/web-client/.env.production` 配置语音 ICE 服务。格式参见
`packages/web-client/.env.example`。没有 TURN 时，同一局中的部分手机或严格 NAT 网络可能无法建立音频连接。

### Local Multiplayer Simulation (Debug Only)

本地模拟模式仍保留，但只在 `?debug=1` 下显示：

```text
http://localhost:5173/?debug=1
```

1. 打开首页，输入昵称并创建房间。
2. 在 Lobby 中点击“添加模拟玩家”凑满 5–10 人。
3. 将所有玩家设为“准备”，房主点击“开始游戏”。
4. 房主可以在游戏页顶部下拉切换“当前查看玩家”，方便调试隐藏信息。

正常生产 UI 不显示“添加模拟玩家”和“切换查看玩家”。

### Network Architecture

- 房主浏览器作为 authoritative host 持有完整 GameState。
- 普通玩家只发送命令，并接收自己的 PlayerView。
- 通信层通过 `packages/p2p-network` 抽象，支持 LocalTransport、WebSocket Relay Transport 与 WebRTC fallback。
- 生产默认使用 WebSocket Relay，浏览器直接连接 `/relay`。
- 调试时可通过 `?transport=webrtc` 显式切回旧 WebRTC/PeerJS。
- 详见 `docs/P2P_NETWORKING.md`。

### Known MVP Limitations

- 房主浏览器必须保持在线；房主离开则当前房间结束。
- 不提供 Host Migration、账号系统、数据库、专用游戏服务器。
- Relay 为单实例、内存房间；服务器重启会清空当前网络房间。
- 游戏中暂不支持完整断线重连。
- 房主调试模式 `?debug=1` 支持切换查看玩家和“一键全部确认”；该入口不会出现在正常联机 UI。
