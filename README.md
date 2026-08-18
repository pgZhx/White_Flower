# Rose & Blade Online

私人技术原型：5–10 人浏览器实时联机隐藏身份桌游。

## 环境与使用约束

- 当前实验室服务器只作为**开发环境**，不用于长期运行生产服务。
- 当前账号是老师提供的**公共账号**。
- 所有涉及本项目目录以外的操作，**必须先询问用户**。
- 未来计划购买独立小服务器专门运行本项目。
- 详细部署分析见 `docs/DEPLOYMENT.md`。

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
- `docs/DEPLOYMENT.md`：部署架构与迁移分析
- `docs/PROJECT_POLICY.md`：项目操作规范
- `packages/game-engine`：独立游戏引擎
