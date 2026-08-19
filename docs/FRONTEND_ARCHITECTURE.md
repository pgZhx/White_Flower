# 纯前端 Web 架构决策

> 状态：已实现（当前 MVP）
> 日期：2026-08

## 技术选型

实际采用：

```text
Vite + React + TypeScript + Tailwind CSS
```

不使用 Next.js；前端是可直接部署的静态 Vite 应用。

## 选择原因

1. 产品目标是纯静态前端，不需要 SSR / API Routes / Server Actions / Server Components。
2. Vite 开发体验简单，构建产物是纯静态文件，可直接部署到 Vercel / Cloudflare Pages / GitHub Pages / Nginx。
3. Vite 不引入额外服务端运行时约束；当前生产联机由 WebSocket Relay 提供稳定转发，WebRTC 仅保留 fallback。
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
HostGameController / PeerGameClient
   ↓
Game Engine / Transport
```

- React 不直接调用 WebRTC API。
- React 不直接持有完整 GameState（Host 除外，Host 也通过 Controller 管理）。
- 所有多人消息通过 `MultiplayerTransport` 抽象。

## 当前游戏桌面

`GameScreen` 负责阶段操作与外围面板；`SeatMap` 组合顶部 `HandCardArea` 和 `RoundTable`。圆桌内部展示白蔷薇、信者、血刃、当前行动和胜利 HUD，外围使用动态人数座位环。

视觉资源使用项目内 `public/game-table/` 的 PNG 与组件内 SVG/CSS，不依赖外部图片服务。司教（`BISHOP`）属于白蔷薇阵营，在手牌视觉上与信者共用白蔷薇卡面。

## 调试入口

`?debug=1` 仅用于本地调试：房主可以切换查看玩家，并使用“一键全部确认”推进确认阶段。该能力通过调试 UI 调用现有确认命令，不改变正常联机等待逻辑。
