# P2P 网络方案说明

> 状态：真实 P2P 联机 MVP 已实现
> 我们的应用没有自己的游戏后端，但 P2P 建连依赖第三方公共信令/穿透基础设施。

## 1. 核心结论

- 游戏本体完全在浏览器中运行。
- 房主浏览器是 authoritative host，持有完整 GameState 与唯一 GameEngine。
- 普通玩家只向房主发送命令，并接收自己的 PlayerView。
- WebRTC DataChannel 负责真实设备之间的点对点数据传输。
- 我们不开发、不维护游戏后端/Database；仅运行一个轻量 PeerJS Signaling 进程用于 WebRTC 信令。

## 2. 信令基础设施

WebRTC 本身不能自动发现对方或交换 SDP/ICE。

本项目使用 **PeerJS**：

- 本地开发默认使用 PeerJS 公共 cloud signaling server。
- 公网部署时使用项目自带的轻量 PeerJS signaling server，由 Nginx 在 `/peerjs` 路径反向代理。
- 实际媒体/数据通道仍然是 WebRTC DataChannel，数据不经过我们的服务器。
- 信令服务器只转发 SDP/ICE，不承载游戏逻辑，不是 Game Server。
- 部分 NAT 环境可能需要 STUN/TURN，PeerJS 默认包含公共 STUN，复杂网络可能需要额外 TURN。

## 3. 房间码即 Host Peer ID

房间码不是后端生成的临时码，而是房主 PeerJS Peer ID：

```text
创建房间
  generateRoomCode() -> "AB7K2P"
  new Peer("AB7K2P")
  https://site.example/?room=AB7K2P

加入房间
  peer.connect("AB7K2P")
```

不需要数据库、不需要 Socket.IO、不需要游戏后端。
公网部署时需要一个非常轻量的 PeerJS signaling 进程，仅用于 WebRTC 信令交换。
如果 PeerJS 返回 ID 不可用，会自动重新生成房间码并重试。

## 4. 当前实现结构

```text
packages/p2p-network/src/
├── types.ts            # NetworkMessage / RoomState / Transport 接口
├── protocol.ts         # 带 version/messageId 的消息构造
├── roomCode.ts         # 房间码 / PeerId / PlayerId / SessionId 生成
├── localTransport.ts   # 单浏览器模拟 / 测试用
└── webRtcTransport.ts  # PeerJS WebRTC DataChannel Transport

packages/web-client/src/
├── game/
│   ├── HostGameController.ts   # 房主权威控制器（唯一允许持有 GameEngine）
│   ├── HostGameClient.ts       # React 统一接口：房主实现
│   ├── PeerGameClient.ts       # React 统一接口：普通玩家实现
│   └── GameClient.ts           # 统一客户端接口
├── network/
│   ├── NetworkHost.ts          # 房主网络层：Peer→Player 映射、命令路由、视图分发
│   └── NetworkPeer.ts          # 普通玩家网络层：只发命令、只收自己的 PlayerView
└── screens/                    # Home / Connecting / Lobby / Game
```

### Transport 抽象

```ts
interface MultiplayerTransport {
  connect(): Promise<void>;
  sendTo(peerId: string, message: NetworkMessage): void;
  send(message: NetworkMessage): void;
  broadcast(message: NetworkMessage): void;
  onMessage(handler: (message, fromPeerId?) => void): Unsubscribe;
  onPeerConnected(handler: (peerId) => void): Unsubscribe;
  onPeerDisconnected(handler: (peerId) => void): Unsubscribe;
  disconnect(): void;
}
```

`sendTo` 的第一个参数始终是 **PeerId**，不是 PlayerId。

## 5. 身份分层

```ts
type PeerId = string;      // PeerJS DataConnection 的身份
type PlayerId = string;    // 房主为每位玩家分配的游戏内身份
type SessionId = string;   // 加入者本次会话标识
```

房主维护：

```ts
Map<PeerId, PlayerId>
Map<PlayerId, PeerId>
```

所有来自 Peer 的 `GAME_COMMAND` 都先通过 `connection.peer` 解析为真实 `PlayerId`，再交给 `GameEngine`。即使命令里携带 `playerId`，房主也会忽略/覆盖。

## 6. Join Flow

```text
Guest 打开 ?room=AB7K2P
  → WebRTC DataChannel 连接 Host
  → 发送 JOIN_REQUEST { nickname, sessionId }
Host 校验：房间存在、未开始、人数 < 10、昵称合法且不重复
  → 分配 PlayerId/seat
  → 保存 PeerId → PlayerId
  → 返回 JOIN_ACCEPTED + 当前 LobbySnapshot
  → 广播新 LobbySnapshot 给所有玩家
```

拒绝原因至少包括：

- ROOM_FULL
- GAME_ALREADY_STARTED
- INVALID_NICKNAME
- DUPLICATE_NICKNAME
- PROTOCOL_MISMATCH

## 7. Game Command Flow

```text
Peer UI
  → PeerGameClient.handleCommand
  → NetworkPeer.sendCommand (不含 playerId，或忽略 UI 传来的 playerId)
  → DataConnection
  → NetworkHost
  → 根据 connection.peer 解析真实 PlayerId
  → HostGameController.handleCommand
  → GameEngine 校验并推进状态
  → Host 为每个玩家 buildPlayerView
  → 分别发送 PLAYER_VIEW
```

## 8. 隐藏信息

- 普通 Peer 只保存自己的 `ClientView`。
- Host 从不广播完整 `GameState`。
- Night / Magic 9 / Magic 11 / 手牌 / 身份 / 水晶都通过 `buildPlayerView` 按玩家投影。
- 普通 Peer 无法在本地构造其他玩家的私人信息。

## 9. 本地模拟调试模式

正常生产 UI 不显示“添加模拟玩家”和“切换查看玩家”。

URL 加上 `?debug=1` 后才会显示：

- Local Simulation Mode 提示
- 添加模拟玩家
- 房主切换查看玩家

## 10. 房主生命周期限制

MVP 明确限制：

- 房主浏览器必须保持在线。
- 如果房主关闭页面或断线，当前房间结束。
- 其他玩家显示“房主已离开，当前游戏无法继续”，并提供返回首页。
- 不实现 Host Migration / Dedicated Server / 自动选新房主。

普通 Peer 断线：

- Lobby 阶段：房主直接移除该玩家并广播新列表。
- 游戏阶段：房主将该玩家标记为 disconnected，游戏继续进行或按当前规则处理；MVP 不提供游戏中重连恢复。

## 11. 自托管 PeerJS Signaling

公网部署时建议同时运行 `server/peer-server.mjs`：

```bash
node server/peer-server.mjs
```

默认监听：

```text
0.0.0.0:9000/peerjs
```

Nginx 会代理：

```text
/peerjs -> 127.0.0.1:9000
```

因此浏览器不需要额外开放 9000 端口，只需要能访问网站本身的 80/443 端口。

部署脚本 `scripts/deploy-static.sh` 会安装静态文件；服务器上的 systemd 服务名为：

```text
white-flower-peer.service
```

## 12. 部署说明

- 前端构建为纯静态站点，可部署到 Vercel / Cloudflare Pages / GitHub Pages / Nginx。
- 不需要运行 Node.js 游戏服务。
- 公网联机使用自托管 PeerJS Signaling；如果遇到严格 NAT，再考虑配置 TURN。

## 13. 已知网络限制

- 部分企业网络、校园网、CGNAT、对称 NAT 环境下 P2P 连接可能失败。
- 当前 MVP 优先覆盖常见家庭网络 / 手机网络。
- 未来如果实测需要，再考虑自建或配置 TURN。

## 14. 公网访问

项目已支持直接部署为公网静态站点，任何网络环境的浏览器都可以打开邀请链接。

当前服务器 Nginx 部署方式：

```bash
./scripts/deploy-static.sh
```

部署后邀请链接为：

```text
http://服务器IP/?room=AB7K2P
```

如果你有域名并配置 HTTPS，则链接为：

```text
https://你的域名/?room=AB7K2P
```

注意：即使页面可以从任何网络打开，WebRTC 实际点对点连接仍可能受 NAT/防火墙影响；公网部署解决的是“页面和房间码可访问”，不保证所有极端网络都能 P2P 直连。
