# Rose & Blade Online

私人技术原型：5–10 人浏览器实时联机隐藏身份桌游。

## 环境与使用约束

- 当前服务器为**个人腾讯云轻量服务器**。
- 当前用户拥有 **sudo 权限**，可以安装系统级依赖，不再受共享实验室服务器限制。
- 历史开发记录：项目早期曾在导师实验室服务器上开发，相关旧限制已失效。
- 本项目目录以外的系统级操作仍建议谨慎执行，并保留必要确认流程。
- 详细部署与环境说明见 `docs/DEPLOYMENT.md`、`docs/PROJECT_POLICY.md`。

## 已确认规则

- 6 人局胜利阈值最终使用：**4 / 4**。

## 第一阶段范围

- 独立 Game Engine（TypeScript / strict）
- 规则配置化
- 服务器权威、隐藏信息投影
- Vitest 规则测试

## 本地命令

```bash
# 安装依赖（在项目根目录）
npm install

# 运行 Game Engine 测试
npm test

# 类型检查
npm run typecheck
```

## 目录

- `docs/RULES.md`：整理后的规则
- `docs/ARCHITECTURE.md`：架构说明
- `docs/RULES_UNCERTAINTIES.md`：待确认规则
- `docs/DEPLOYMENT.md`：部署架构与环境说明
- `docs/PROJECT_POLICY.md`：项目操作规范
- `docs/FRONTEND_MIGRATION_ANALYSIS.md`：纯前端多人桌游迁移分析
- `packages/game-engine`：独立游戏引擎


## Development

### Frontend Development

```bash
npm install
npm run dev:web
```

打开 http://localhost:5173 。

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

### Real Multiplayer (P2P)

当前已经支持真实浏览器 P2P 联机：

1. 房主打开公网地址并创建房间。
2. 获得邀请链接 `https://域名/?room=AB7K2P`。
3. 朋友在任意网络打开链接，输入昵称加入。
4. 5–10 人进入同一 Lobby，全员 Ready 后由房主开始游戏。
5. 每个玩家只看到自己的身份、手牌、水晶与私人信息。

- 房主浏览器是 authoritative host，持有完整 GameState。
- 普通玩家只发送命令，并接收自己的 PlayerView。
- 通信层通过 `packages/p2p-network` 抽象，支持 LocalTransport 与 WebRTC Transport。
- 公网部署使用自托管 PeerJS Signaling，Nginx 代理 `/peerjs`。
- 详见 `docs/P2P_NETWORKING.md`。

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

### P2P Architecture

- 房主浏览器作为 authoritative host 持有完整 GameState。
- 普通玩家只发送命令，并接收自己的 PlayerView。
- 通信层通过 `packages/p2p-network` 抽象，支持 LocalTransport 与 WebRTC Transport。
- 公网部署使用自托管 PeerJS Signaling，不依赖我们维护游戏后端。
- 详见 `docs/P2P_NETWORKING.md`。

### Known MVP Limitations

- 房主浏览器必须保持在线；房主离开则当前房间结束。
- 不提供 Host Migration、账号系统、数据库、专用游戏服务器。
- 当前已实现真实 WebRTC P2P 联机主流程。
- 复杂断线重连与 TURN 配置暂未完成；部分极端 NAT 网络可能无法 P2P 直连。
