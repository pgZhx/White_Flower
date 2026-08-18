# 纯前端多人桌游迁移分析

> 状态：Phase 0 / Phase 1 分析文档
> 目标：将现有 `game-engine` 最大程度复用到“朋友打开网页即可玩”的纯前端多人桌游 MVP。
> 本文档只做分析，不包含大规模编码。

## 1. 当前架构分析

### 1.1 仓库结构

```text
White_Flower/
├── package.json                 # npm workspaces
├── tsconfig.base.json
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DEPLOYMENT.md
│   ├── PROJECT_POLICY.md
│   ├── RULES.md
│   ├── RULES_UNCERTAINTIES.md
│   └── FRONTEND_MIGRATION_ANALYSIS.md  # 本文档
└── packages/
    └── game-engine/             # 当前唯一 package
        ├── src/
        │   ├── config/          # 人数、身份、卡牌常量
        │   ├── engine/          # GameEngine、回合、魔法、结算、视图
        │   ├── types.ts
        │   ├── errors.ts
        │   ├── random.ts
        │   ├── events.ts
        │   └── index.ts
        ├── tests/               # Vitest 测试
        └── package.json
```

### 1.2 已完成能力

当前 Game Engine 已覆盖：

- 5–10 人身份配置与随机分配
- 水晶系统
- 初始手牌 / DOUBLE_KNIFE 夜晚替换
- 夜晚识别信息
- 回合状态机
- 12 个 Magic 效果
- Reveal / Sacrifice / Death / Blade / White Rose Safe
- 胜利判定与最终水晶判定
- 隐藏信息 View Projection
- 事件日志
- Vitest 测试

### 1.3 当前分层

- `config/`：规则常量，纯数据。
- `engine/`：状态转换函数，纯 TypeScript。
- `GameEngine.ts`：面向外部调用的门面。
- `view.ts`：从完整状态投影出某个玩家的可见视图。
- `random.ts`：随机源抽象，浏览器和 Node 都可运行。

### 1.4 当前测试环境检查结论

当前环境已确认：

- 当前服务器为个人腾讯云轻量服务器，用户有 sudo 权限，可以安装系统级依赖。
- 旧的“实验室服务器 / 禁止 sudo / 不能全局安装”限制已过期，相关文档已更新。

额外发现（记录，不在本阶段修复）：

- 仓库当前测试/类型检查并不能直接通过。
- 主要原因是 `tests/*.test.ts` 从 `../src/index.js` 导入了 `createStateWithRoles`、`advanceThroughNight`、`setHand`、`playerById` 等测试辅助函数，但这些函数实际定义在 `tests/helpers.ts` 中，并未从 `src/index.ts` 导出。
- 另外 `src/engine/magic.ts` 和 `src/engine/round.ts` 存在类型错误（`appendEvent` 调用处被推断为返回 `GameEvent[]` 但赋值给 `GameState`）。
- 这些属于工程化/测试接线问题，不影响规则设计本身，但会影响“迁移前基线”。建议在开始前端开发前先修复，避免把不稳定的基线带到新 package。

## 2. Game Engine 是否可以直接运行在浏览器环境

结论：**可以，但需要少量工程化适配。**

### 2.1 可直接运行的部分

- 源码不依赖 Node.js 内置模块（`fs`、`path`、`os` 等）。
- 不依赖 React、Socket.IO、数据库。
- 随机数使用 `Math.random`/纯 JS 实现，浏览器可用。
- 状态是普通 JSON 可序列化对象，适合通过 P2P 消息传输。
- View Projection 已经能生成每个玩家可见的 `ClientView`，前端可以直接使用。

### 2.2 需要适配的地方

1. **模块解析与构建**
   - 当前使用 `"type": "module"` 且源码内使用 `.js` 后缀相对导入。
   - 在 Vite/Next.js 的 bundler 模式下通常可处理，但需要验证。
   - 建议让 `game-engine` 暴露清晰的浏览器入口，并保持纯 TypeScript / 无环境依赖。

2. **`events.ts` 的模块级计数器**
   - `createEvent` 使用模块级 `eventSequence` 生成事件 ID。
   - 在多人 P2P 中，如果多个“权威副本”各自执行，会产生不一致的事件 ID。
   - 前端阶段要么只让房主产生事件，要么改为基于 `gameId + state.version` 的确定性 ID。

3. **`Date.now()` 时间戳**
   - 浏览器可用，但 P2P 多端同步时不要求完全一致，只作展示/日志用途即可。

4. **状态所有权模型**
   - 当前 Game Engine 是“服务器权威”设计：客户端只发送意图，引擎在服务器持有完整状态。
   - 纯前端 P2P 需要决定谁持有权威状态、如何广播变更、如何让其他客户端只拿到自己的 View。
   - 建议 MVP 采用“房主权威（Host Authority）”：
     - 房主浏览器运行完整 Game Engine。
     - 房主通过 P2P 广播公开状态/事件和每个玩家的私有 View。
     - 普通玩家只提交意图，不直接修改权威状态。

5. **测试辅助函数导出**
   - 当前测试直接从 `src/index.ts` 导入测试辅助函数，需要修复为从 `tests/helpers.ts` 导入或单独导出测试工具。
   - 这不影响浏览器运行，但影响 CI/开发基线。

## 3. 需要修改的位置

### 3.1 必须修改 / 新增

| 位置 | 内容 | 优先级 |
|---|---|---|
| `packages/game-engine/tests/*.test.ts` | 修正测试辅助函数导入路径，恢复测试基线 | 高 |
| `packages/game-engine/src/engine/magic.ts` | 修复 `appendEvent` 相关类型错误（只改工程类型，不改规则） | 高 |
| `packages/game-engine/src/engine/round.ts` | 同上 | 高 |
| `packages/game-engine/package.json` | 增加 browser-friendly 的入口或构建配置（可选） | 中 |
| `packages/web-client` | 新增 React / Next.js 前端 | 高 |
| `packages/p2p-network` | 新增 P2P 通信层 | 高 |

### 3.2 建议不修改 / 尽量不动

- 规则常量：`src/config/*`
- 状态机：`src/types.ts` 中的 `GamePhase`、`GameState`
- 回合逻辑：`src/engine/round.ts`、`src/engine/magic.ts` 的规则行为
- 隐藏信息投影：`src/engine/view.ts`

原则：**如果前端需要更多能力，优先在 `web-client` / `p2p-network` 中包装或扩展，而不是重写 Game Engine。**

## 4. 前端需要新增哪些 package

### 4.1 建议目录

```text
packages/
├── game-engine/       # 保留，作为核心规则包
├── p2p-network/       # 新增：房间、信令抽象、WebRTC DataChannel、消息协议
└── web-client/        # 新增：Next.js + React + TypeScript + Tailwind CSS
```

### 4.2 `p2p-network` 建议职责

- 房间 ID 生成与解析。
- 创建房间（Host）。
- 加入房间（Guest）。
- 玩家列表/昵称/准备状态同步。
- 基于 WebRTC DataChannel 的点对点连接。
- 消息协议：
  - `hello / join / player-list / ready / start`
  - `intent`（普通玩家的出牌、Pass、Reveal 等意图）
  - `state-sync`（房主广播的公开状态 / 玩家私有 View）
  - `event-log`（同步事件日志）
- 第一版如果 WebRTC 信令复杂，可先做“单浏览器多人模拟”模式作为降级方案。

### 4.3 `web-client` 建议页面

| 路由 | 内容 |
|---|---|
| `/` | 首页：显示“血与刃的白蔷薇”，[创建房间] / [加入房间] |
| `/room/[id]` | 房间页：房间 ID、玩家列表、准备状态、开始游戏按钮 |
| `/game/[id]` | 游戏页：我的身份、我的手牌、当前阶段、当前金币持有人、水晶状态、操作按钮 |

### 4.4 推荐技术栈

- Next.js + React + TypeScript
- Tailwind CSS
- WebRTC DataChannel（第一版可先用单浏览器模拟）
- Vitest 继续用于单元测试
- 不引入 Socket.IO / 数据库 / 用户系统 / 登录系统

## 5. 纯前端多人模式设计方案

### 5.1 推荐：房主权威（Host Authority）

因为游戏本身需要隐藏信息，且 WebRTC 没有中心服务器，最简单可靠的方案是：

1. **房主浏览器**：
   - 运行完整 `GameState` 和 `GameEngine`。
   - 负责创建房间、分配座位、随机数、开始游戏、推进状态机。
   - 在每次状态变化后，为每个玩家调用 `buildPlayerView(state, playerId)`。
2. **普通玩家浏览器**：
   - 不保存完整权威状态。
   - 只保存自己的 `ClientView`。
   - 向房主发送“意图”（如 `PLAY_CARD`、`PASS`、`REVEAL`、`MAGIC_TARGET`）。
3. **P2P 通信**：
   - 第一版可以使用“星型拓扑”：所有玩家只与房主建立 WebRTC DataChannel。
   - 房主负责广播公开信息，私密信息只发给对应玩家。
   - 后续如果希望减少房主带宽，可再演进为 mesh / 中继。

### 5.2 不推荐的方案

- **全量状态广播给所有人**：会泄露隐藏身份/手牌，违背 `view.ts` 的投影设计。
- **每个客户端都跑完整权威状态**：随机数和事件同步复杂，容易产生分叉。
- **引入后端服务器**：当前阶段明确不做，优先 P2P。

### 5.3 消息协议草案

```ts
// 玩家 -> 房主
type ClientMessage =
  | { type: 'JOIN'; roomId: string; nickname: string }
  | { type: 'READY'; ready: boolean }
  | { type: 'START_GAME' }
  | { type: 'INTENT'; payload: unknown }; // 具体动作由 web-client 根据 Game Engine API 生成

// 房主 -> 玩家
type HostMessage =
  | { type: 'ROOM_STATE'; roomState: unknown }
  | { type: 'YOUR_VIEW'; view: ClientView }
  | { type: 'PUBLIC_EVENT'; event: GameEvent }
  | { type: 'ERROR'; code: string; message: string };
```

### 5.4 单浏览器模拟模式

如果 WebRTC 信令在 MVP 中实现成本过高，第一版可以：

- 在一个浏览器内同时创建多个“虚拟玩家”。
- 每个虚拟玩家持有独立 `ClientView`。
- 通过本地事件总线模拟 P2P 消息。
- 这样先完成 UI 和 Game Engine 接入，再接真实 WebRTC。

## 6. 预计开发阶段

### Phase A：基线修复（0.5–1 天）

- 修复 Game Engine 测试辅助函数导入和类型错误。
- 恢复 `npm test` / `npm run typecheck` 通过。
- 为 `game-engine` 增加浏览器 bundle 验证（可暂不构建，至少确认 Vite 可解析）。

### Phase B：web-client 基础（1–2 天）

- 初始化 `packages/web-client`（Next.js + TS + Tailwind）。
- 实现首页、创建/加入房间表单。
- 实现房间页：玩家列表、准备状态、开始游戏按钮。
- 接入 `game-engine` 的 `createGame`、`startGame` 等 API 做本地模拟。

### Phase C：游戏界面 MVP（2–3 天）

- 实现游戏页：
  - 我的身份 / 我的手牌
  - 当前阶段 / 当前金币持有人 / 水晶状态
  - 操作按钮：出牌、Pass、Reveal、回合推进
- 使用单浏览器多人模拟模式驱动完整流程。

### Phase D：P2P 通信（2–4 天）

- 新增 `packages/p2p-network`。
- 实现房间 ID、信令抽象、WebRTC DataChannel 星型连接。
- 将 web-client 从本地模拟切换为真实 P2P。
- 确保隐藏信息只发送给对应玩家。

### Phase E：联调与打磨（1–2 天）

- 多浏览器/多设备联调。
- 断线重连、房主离开等基础容错。
- 完善 README 和本地启动文档。

总计预计：**约 1–2 周（取决于 WebRTC 信令方案）**。

## 7. 风险与注意事项

1. **WebRTC 信令**：浏览器之间不能直接交换 SDP/ICE，必须有一个极简信令通道。可以先用“房间 ID + 手动复制邀请码”或临时 Public TURN/STUN；不引入正式后端。
2. **房主权威的公平性**：房主可以看到完整状态，理论上可作弊。当前产品定位是“现实朋友开黑”，接受该风险。
3. **事件 ID / 随机种子同步**：MVP 中由房主统一生成即可；如果未来需要多端校验再做确定性同步。
4. **不破坏 game-engine**：前端需要新增能力时，优先新增 package 或通过 wrapper 调用，避免修改核心规则。
5. **测试基线**：迁移前必须先把当前失败的测试/类型检查修好，否则后续很难判断新代码是否引入回归。

## 8. 下一步建议

1. 在 `frontend-p2p-mvp` 分支上完成本文档。
2. 修复 Game Engine 测试/类型基线（只做工程修复，不改规则）。
3. 初始化 `web-client` 和 `p2p-network` 两个空 package。
4. 先实现“单浏览器多人模拟模式”，再接 WebRTC。
