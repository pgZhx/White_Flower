# Rose & Blade Online — 架构说明

## 目标

第一阶段只实现独立、可测试、服务器权威的 Game Engine。

- TypeScript / strict
- 不依赖 React
- 不依赖 Socket.IO
- 随机性由 RandomProvider 注入
- 所有秘密信息通过 View Projection 过滤
- 规则集中配置，禁止魔法数字散落

## 目录结构

```text
flower/
├── package.json
├── tsconfig.base.json
├── docs/
│   ├── RULES.md
│   ├── ARCHITECTURE.md
│   └── RULES_UNCERTAINTIES.md
└── packages/
    └── game-engine/
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
- `view.ts`：将服务器权威状态投影为某个玩家可见的视图
- `random.ts`：抽象随机源，测试可注入 seeded RNG

## 服务器权威原则

- 客户端只发送“意图”（例如 playCard、pass、chooseTarget）
- 所有合法性判断在 GameEngine 内完成
- 随机洗牌、随机选牌、身份分配都在服务器完成
- 客户端不持有权威状态

## 事件日志

所有状态变更产生 `GameEvent`，保存在 `eventLog` 中，便于审计、回放和调试。

## 未来扩展

- 将 `GameEngine` 包装为 Socket.IO 房间服务
- 将内存房间状态替换为 Redis
- 将对局记录持久化到 PostgreSQL / Prisma
- 增加多实例支持
