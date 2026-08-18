# 纯前端 Web 架构决策

> 状态：已确认
> 日期：Phase 8 Stage B

## 技术选型

采用：

```text
Vite + React + TypeScript + Tailwind CSS
```

不使用 Next.js。

## 选择原因

1. 产品目标是纯静态前端，不需要 SSR / API Routes / Server Actions / Server Components。
2. Vite 开发体验简单，构建产物是纯静态文件，可直接部署到 Vercel / Cloudflare Pages / GitHub Pages / Nginx。
3. WebRTC 是浏览器原生能力，Vite 不引入额外服务端约束，对 P2P 最自然。
4. 项目规模小，不需要 Next.js 的复杂目录和运行时。
5. 可以保持 `game-engine`、`p2p-network`、`web-client` 三者清晰解耦。

## 目录规划

```text
packages/
├── game-engine/     # 规则核心，纯 TS
├── p2p-network/     # Transport / Protocol，纯 TS，浏览器可运行
└── web-client/      # Vite + React + TS + Tailwind 静态前端
```

## 数据流

```text
React UI
   ↓
Room/Host Controller
   ↓
Game Engine / Transport
```

- React 不直接调用 WebRTC API。
- React 不直接持有完整 GameState（Host 除外，Host 也通过 Controller 管理）。
- 所有多人消息通过 `MultiplayerTransport` 抽象。
