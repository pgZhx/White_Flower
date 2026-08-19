# 项目操作规范（必须遵守）

> 本文档用于记录本项目当前环境与操作边界。
> 历史说明：早期实验室服务器的“禁止 sudo / 不能全局安装 / 公共账号”限制已失效，保留在 git 历史中。

## 1. 当前服务器定位

- 当前服务器为**个人腾讯云轻量服务器**。
- 当前用户拥有 **sudo 权限**。
- 可以安装系统级依赖，可以正常使用 sudo。
- 不再是共享实验室服务器，不再需要遵守旧限制。
- 仍建议优先在项目目录内安装 npm 依赖，避免不必要地污染系统环境。

## 2. 账号性质

- 当前为个人服务器/个人用户，不是老师提供的公共账号。
- AI 或自动化工具在修改项目内文件时可正常执行。
- 对于项目目录外的系统级变更（如安装全局软件、修改系统服务），当前环境允许，但仍应谨慎操作并让用户知情。

## 3. 依赖安装

- 项目内 npm 依赖安装在项目根目录：

  ```text
  /home/ubuntu/apps/White_Flower/node_modules
  ```

- 当前允许在需要时使用 sudo 安装系统级依赖。
- 历史禁止项（`npm install -g`、`sudo npm install`、全局 `pip install`）已解除；是否使用以实际开发需求为准。

## 4. 已确认规则

- 6 人局胜利阈值：**4 / 4**。

## 5. 部署目标

- 当前阶段：纯前端多人桌游 MVP，优先使用静态托管 / 局域网 / P2P。
- 后续如需信令服务器，再考虑轻量 Node 服务。
- 详细分析见 `docs/DEPLOYMENT.md`、`docs/FRONTEND_MIGRATION_ANALYSIS.md`。

## 6. 当前验证基线

涉及规则、网络或前端桌面的改动，提交前执行：

```bash
npm run typecheck
npm test
npm run build:web
```

其中 `npm test` 覆盖 Game Engine、P2P Network 和 Web Client 测试；`build:web` 验证 Vite 静态产物可生成。
