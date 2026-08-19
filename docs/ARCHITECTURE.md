# Rose & Blade Online — 架构说明

> 本文档对应当前 MVP 架构。Game Engine 已运行在浏览器房主端，普通玩家通过网络命令参与对局。

当前联机默认使用 WebSocket Relay；Relay 只转发消息，不持有游戏状态。旧 WebRTC/PeerJS 作为显式 fallback 保留。

## 目标

当前实现保持独立、可测试、房主权威的 Game Engine。

- TypeScript / strict
- 不依赖 React
- 不依赖 Socket.IO
- 随机性由 RandomProvider 注入
- 所有秘密信息通过 View Projection 过滤
- React UI 与网络 Transport 不直接修改规则状态
- 规则集中配置，禁止魔法数字散落

## 目录结构

```text
White_Flower/
├── package.json
├── tsconfig.base.json
├── docs/
│   ├── RULES.md
│   ├── ARCHITECTURE.md
│   └── RULES_UNCERTAINTIES.md
└── packages/
    ├── game-engine/
    ├── p2p-network/
    └── web-client/
        ├── package.json
        ├── tsconfig.json
        ├── vitest.config.ts
        ├── src/
        │   ├── index.ts
        │   ├── types.ts
        │   ├── errors.ts
        │   ├── random.ts
        │   ├── config/
        │   │   ├── playerCountRules.ts
        │   │   └── cards.ts
        │   ├── engine/
        │   │   ├── GameEngine.ts
        │   │   ├── setup.ts
        │   │   ├── night.ts
        │   │   ├── magic.ts
        │   │   ├── round.ts
        │   │   ├── victory.ts
        │   │   └── view.ts
        │   └── events.ts
        └── tests/
            ├── playerConfiguration.test.ts
            ├── initialHand.test.ts
            ├── night.test.ts
            ├── roundAndVictory.test.ts
            ├── magic.test.ts
            ├── finalCrystal.test.ts
            └── hiddenInfo.test.ts
```

## 分层

- `config/`：人数、身份、阈值、卡牌常量
- `engine/`：游戏状态转换、魔法、回合、胜负
- `GameEngine.ts`：对外的命令门面，负责校验、推进状态、记录事件
- `view.ts`：将房主权威状态投影为某个玩家可见的视图
- `random.ts`：抽象随机源，测试可注入 seeded RNG

## 房主权威原则

- 客户端只发送“意图”（例如 playCard、pass、chooseTarget）
- 所有合法性判断在 GameEngine 内完成
- 随机洗牌、随机选牌、身份分配都在房主浏览器的 Game Engine 完成
- Host 持有完整 `GameState`，根据 `buildPlayerView` 为每个玩家生成视图
- 普通 Peer 只持有自己的 `ClientView`，不能通过 UI 修改权威状态
- Relay 只路由网络消息，不执行 Game Engine，也不解析身份/手牌

## 前端桌面层

`packages/web-client` 使用 Vite + React + TypeScript。游戏桌面组件位于 `src/components/game-table/`：

- `RoundTable`：木质圆桌、中央 HUD 与座位环组合
- `PlayerSeatRing` / `PlayerSeat`：根据玩家人数数学分布座位，自己固定在底部附近
- `RoseTracker` / `BloodBladeTracker`：白蔷薇、信者、血刃与死亡信者状态
- `HandCardArea` / `assets/CardFrame`：顶部固定三张手牌槽
- `assets/RoseIcon` / `BladeIcon` / `BelieverIcon`：离线可构建的参考风格视觉素材

布局要求：手牌位于座位图顶部；玩家头像缩小并与圆桌边界保持间距；桌面中央信息不得被手牌或座位遮挡。

## 事件日志

所有状态变更产生 `GameEvent`，保存在 `eventLog` 中，便于审计、回放和调试。

## 未来扩展

- 将 `GameEngine` 包装为 Socket.IO 房间服务
- 将内存房间状态替换为 Redis
- 将对局记录持久化到 PostgreSQL / Prisma
- 增加多实例支持
