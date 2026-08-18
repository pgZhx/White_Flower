# 部署架构调整分析

> 最后更新：Phase 1.5

## 1. 环境定位

当前服务器是导师租用的科研项目服务器，账号是老师提供的公共账号。

因此明确：

- **当前实验室服务器只作为开发环境。**
- **不允许长期在生产环境运行本项目后端。**
- 未来购买独立的小型云服务器后，再将服务部署到该服务器。
- AI 或任何自动化工具涉及本项目目录以外的操作，都必须先询问用户。

## 2. 当前项目是否方便迁移

结论：**当前项目结构适合未来迁移到独立云服务器。**

原因：

- Game Engine 位于独立包：

  ```text
  packages/game-engine
  ```

  不依赖 React、不依赖 Socket.IO、不依赖浏览器环境。

- 项目依赖全部声明在：

  ```text
  package.json
  packages/game-engine/package.json
  ```

  没有依赖系统级全局包。

- 未来新增 Server 和 Web 时，建议继续采用 npm workspaces：

  ```text
  packages/
    game-engine/
    server/
    web/
  ```

- 数据库/缓存目前未引入，迁移成本低。
- 若未来使用 Redis / PostgreSQL，也建议通过 Docker Compose 或云数据库托管，不绑定当前服务器。

## 3. 目标部署架构

```text
朋友浏览器
    ↓
Cloudflare Tunnel / 云服务器公网 IP
    ↓
反向代理（Nginx / Caddy）
    ↓
Node.js Game Server（Socket.IO + HTTP）
    ↓
Game Engine
```

## 4. 当前实验室服务器 vs 未来云服务器

| 项目 | 当前实验室服务器 | 未来独立云服务器 |
|---|---|---|
| 定位 | 开发、测试、写代码 | 运行正式服务 |
| 数据 | 可以只保留源码和测试 | 需要运行 Web + Socket.IO |
| 公网 | 不适合直接暴露 | 可绑定域名/公网 IP |
| 资源 | 大机器，但共享/公共 | 小机器，专用于本项目 |
| 风险 | 不能影响导师科研任务 | 可自由安装运行环境 |

## 5. 迁移时需要带走的内容

```text
源码：
  packages/
  docs/
  package.json
  package-lock.json
  tsconfig.base.json
  README.md

运行依赖：
  在云服务器上执行 npm install 即可，不需要拷贝 node_modules

环境变量/配置：
  端口
  Socket.IO CORS
  未来的 Redis/PostgreSQL 连接串
  未来的管理员/密钥等
```

## 6. 迁移注意事项

- 不要在实验室服务器上运行长期后台服务。
- 不要把生产数据库、密钥、正式域名绑到实验室服务器。
- 建议所有配置通过环境变量或 `.env.example` 管理，避免硬编码。
- 未来云服务器建议使用非 root 用户运行服务。
- 如果使用 Docker，确保 Dockerfile 和 compose 文件都在项目内。

## 7. 当前建议

Phase 2 开发时仍然在实验室服务器本地进行：

- 启动开发服务器只用于联调。
- 需要给朋友临时测试时，优先使用 Cloudflare Tunnel 等临时隧道。
- 不在实验室服务器上做 systemd 常驻服务。
- 正式部署放到未来购买的云服务器。
