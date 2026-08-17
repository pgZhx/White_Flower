# Rose & Blade Online

私人技术原型：5–10 人浏览器实时联机隐藏身份桌游。

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
- `packages/game-engine`：独立游戏引擎
