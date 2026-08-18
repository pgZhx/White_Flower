# P2P 网络方案说明

> 状态：MVP 已实现 Transport 抽象与 PeerJS WebRTC Transport
> 我们的应用没有自己的游戏后端，但 P2P 建连依赖第三方公共信令/穿透基础设施。

## 1. 核心结论

- 游戏本体完全在浏览器中运行。
- 房主浏览器是 authoritative host，持有完整 GameState。
- 普通玩家只向房主发送命令，并接收自己的 PlayerView。
- WebRTC DataChannel 负责真实设备之间的点对点数据传输。
- 我们不开发、不维护游戏后端/Signaling Server/Database。

## 2. 为什么需要外部基础设施

WebRTC 本身不能自动发现对方或交换 SDP/ICE。

因此本项目使用 **PeerJS**：

- PeerJS 提供公共 cloud signaling server。
- 浏览器通过 PeerJS 使用房间 ID / Peer ID 互相发现。
- 实际媒体/数据通道仍然是 WebRTC DataChannel，数据不经过我们的服务器。
- 部分 NAT 环境可能需要 STUN/TURN，PeerJS 默认包含公共 STUN，复杂网络可能需要额外 TURN。

## 3. 当前实现

```text
packages/p2p-network/src/
├── types.ts            # NetworkMessage / RoomState / Transport 接口
├── protocol.ts         # 带 version/messageId 的消息构造
├── localTransport.ts   # 单浏览器模拟 / 测试用
└── webRtcTransport.ts  # PeerJS WebRTC DataChannel Transport
```

### Transport 抽象

```ts
interface MultiplayerTransport {
  connect(): Promise<void>;
  sendTo(playerId: string, message: NetworkMessage): void;
  send(message: NetworkMessage): void;
  broadcast(message: NetworkMessage): void;
  onMessage(handler): Unsubscribe;
  disconnect(): void;
}
```

### 消息协议

所有消息至少包含：

```ts
{
  version: 1,
  type: string,
  messageId: string
}
```

类型包括：

- JOIN_REQUEST / JOIN_ACCEPTED / JOIN_REJECTED
- LOBBY_SNAPSHOT / PLAYER_READY_CHANGED
- GAME_COMMAND / PLAYER_VIEW / PUBLIC_EVENT
- HOST_ERROR / PING

禁止直接向所有 Peer 广播完整 GameState。

## 4. 房主生命周期限制

MVP 明确限制：

- 房主浏览器必须保持在线。
- 如果房主关闭页面或断线，当前房间结束。
- 其他玩家显示“房主已离开，当前游戏无法继续”，并提供返回首页。
- 不实现 Host Migration / Dedicated Server / 自动选新房主。

## 5. 部署说明

- 前端构建为纯静态站点，可部署到 Vercel / Cloudflare Pages / GitHub Pages / Nginx。
- 不需要运行 Node.js 游戏服务。
- 公网联机依赖 PeerJS 公共信令与 STUN；如果遇到严格 NAT，再考虑配置 TURN。

## 6. 后续改进方向

- 增加 TURN 配置以提升连通率。
- 增加房间密码/简单邀请校验。
- 增加断线重连与房主迁移（当前明确不做）。
