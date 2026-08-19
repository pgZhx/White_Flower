# 多人联机网络方案说明

> 状态：生产默认使用 WebSocket Relay。
> 旧 WebRTC/PeerJS 仍保留为 `?transport=webrtc` 调试/回退通道。

## 1. 核心结论

- 游戏本体完全在浏览器中运行。
- 房主浏览器是 authoritative host，持有完整 GameState 与唯一 GameEngine。
- 普通玩家只向房主发送命令，并接收自己的 PlayerView。
- Relay 服务器只转发网络消息，不知道角色、手牌、水晶、魔法、胜利条件，也不运行 GameEngine。
- 生产环境默认不依赖 WebRTC/STUN/TURN 跨网络穿透；通过 WebSocket Relay 转发。

## 2. 当前生产架构

```text
Host Browser
    │ WebSocket
    ▼
WebSocket Relay (127.0.0.1:9001, Nginx /relay)
    ▲ WebSocket
    │
Peer Browser
```

- Relay 只维护内存中的网络转发房间 `RelayRoom`。
- Relay 不保存游戏状态，不执行任何游戏规则。
- GameEngine 仍然只存在于房主浏览器。

## 3. 为什么从 WebRTC 迁移到 Relay

- WebRTC 依赖 ICE、NAT/CGNAT、STUN/TURN。
- 手机网络、跨运营商、严格 NAT 下经常无法直连。
- WebSocket Relay 只需要浏览器能访问服务器 80/443，跨网络稳定性更高。
- 代价是消息经过服务器转发，但服务器不解析游戏内容。

## 4. Transport 抽象

`MultiplayerTransport` 保持原有接口：

```ts
connect(): Promise<void>;
sendTo(peerId: string, message: NetworkMessage): void;
send(message: NetworkMessage): void;
broadcast(message: NetworkMessage): void;
onMessage(handler: (message, fromPeerId?) => void): Unsubscribe;
onPeerConnected(handler: (peerId) => void): Unsubscribe;
onPeerDisconnected(handler: (peerId) => void): Unsubscribe;
disconnect(): void;
```

现有 `NetworkHost` / `NetworkPeer` 不需要知道底层是 WebSocket Relay 还是 WebRTC。

## 5. 实现文件

```text
server/relay-server.mjs                          # 轻量 WebSocket Relay Server
packages/p2p-network/src/relayProtocol.ts        # Relay 传输层协议类型
packages/p2p-network/src/webSocketRelayTransport.ts  # 浏览器 WebSocket Relay Transport
packages/p2p-network/src/webRtcTransport.ts      # 旧 WebRTC/PeerJS Transport（保留）
packages/p2p-network/src/localTransport.ts       # 本地模拟 / 测试
```

## 6. Relay 协议

Relay 只理解以下 envelope：

```text
REGISTER_HOST
REGISTER_PEER
ROUTE_TO_HOST
ROUTE_TO_PEER
BROADCAST
REGISTERED
PEER_CONNECTED
PEER_DISCONNECTED
MESSAGE
HOST_DISCONNECTED
ERROR
```

Relay 根据 WebSocket 连接本身确定真实 `clientId`，不会相信消息里的 `fromPeerId` / `playerId`。

## 7. 身份分层

```ts
type PeerId = string;      // 网络连接 ID（Relay 中即 clientId）
type PlayerId = string;    // 房主为每位玩家分配的游戏内身份
type SessionId = string;   // 加入者本次会话标识
```

房主维护：

```ts
Map<PeerId, PlayerId>
Map<PlayerId, PeerId>
```

所有来自 Peer 的 `GAME_COMMAND` 都先通过真实连接 ID 解析为 `PlayerId`，再交给 `GameEngine`。

## 8. Join Flow

```text
Guest 打开 ?room=AB7K2P
  → WebSocketRelayTransport 注册 REGISTER_PEER
  → Relay 返回 REGISTERED（若房间不存在则立即 ERROR）
  → NetworkPeer 发送 JOIN_REQUEST
Host 校验昵称/人数/未开始
  → 分配 PlayerId/seat
  → 保存 PeerId → PlayerId
  → 返回 JOIN_ACCEPTED + LobbySnapshot
```

## 9. Game Command Flow

```text
Peer UI
  → PeerGameClient.handleCommand
  → NetworkPeer.sendCommand
  → WebSocketRelayTransport ROUTE_TO_HOST
  → Relay MESSAGE 给 Host
  → NetworkHost 根据真实 fromPeerId 解析 PlayerId
  → HostGameController → GameEngine
  → Host buildPlayerView(PlayerId)
  → WebSocketRelayTransport ROUTE_TO_PEER
  → Peer 只收到自己的 PlayerView
```

## 10. 隐藏信息

- 普通 Peer 只保存自己的 `ClientView`。
- Host 从不广播完整 `GameState`。
- Night / Magic 9 / Magic 11 / 手牌 / 身份 / 水晶都通过 `buildPlayerView` 按玩家投影。
- Relay 不解析消息，因此也不可能从服务器侧泄露游戏内容。

## 11. 本地开发

```bash
# Terminal A
npm run dev:relay

# Terminal B
npm run dev:web
```

打开 `http://localhost:5173` 即可多浏览器联机。

`?debug=1` 是单浏览器调试入口，可创建模拟玩家、切换玩家视角并使用一键确认；不改变真实 Peer 的确认等待流程。

## 12. WebRTC 旧方案

保留旧 WebRTC/PeerJS 作为 fallback / 调试：

```text
http://localhost:5173/?transport=webrtc
http://服务器IP/?transport=webrtc
```

生产默认不使用 WebRTC。

## 13. 部署

- 前端静态文件由 Nginx 提供。
- Nginx 将 `/relay` 反向代理到 `127.0.0.1:9001`。
- systemd 服务：`white-flower-relay.service`。
- 旧 PeerJS 服务：`white-flower-peer.service`，仅用于 WebRTC fallback。

## 14. 已知限制

- 房主浏览器必须保持在线；房主离开则当前房间结束。
- 不实现 Host Migration。
- 游戏中暂不支持完整断线重连。
- Relay 为单实例、内存房间；服务器重启会清空当前网络房间。
- 当前 HTTP 未加密；后续建议配置 HTTPS/WSS。
