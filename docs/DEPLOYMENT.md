# 部署架构与环境说明

> 最后更新：真实 P2P 联机 MVP + 公网 Nginx 部署
> 历史说明：本文早期版本描述的是导师实验室服务器环境；当前环境已迁移为个人腾讯云轻量服务器。

## 1. 当前环境定位

- 当前服务器：**个人腾讯云轻量服务器**。
- 当前用户：拥有 **sudo 权限**。
- 可以安装系统级依赖，可以正常使用 sudo。
- 不再是共享实验室服务器，不再需要遵守“禁止 sudo / 不能全局安装”的旧限制。
- 项目早期曾在导师实验室服务器上开发，相关历史限制已经失效；历史记录保留在 git 中。

## 2. 当前项目结构

结论：**Game Engine 已独立成包，适合作为纯前端多人桌游的核心复用。**

原因：

- `packages/game-engine` 不依赖 React、不依赖 Socket.IO、不依赖 Node.js 专有 API。
- 项目依赖全部声明在 `package.json` / `packages/game-engine/package.json`，没有系统级全局依赖。
- 下一阶段新增 `web-client` 与 `p2p-network` 时，建议继续采用 npm workspaces：

  ```text
  packages/
    game-engine/
    web-client/
    p2p-network/
  ```

- 当前未引入数据库/缓存；公网部署仅额外运行一个轻量 PeerJS Signaling 进程，不承载游戏逻辑。

## 3. 当前部署架构

```text
朋友浏览器 / 手机浏览器
    ↓ HTTP/HTTPS
Nginx 静态站点（packages/web-client/dist）
    ↓
浏览器加载 React + Game Client
    ↓
WebRTC P2P DataChannel
    ↑ 信令
Nginx /peerjs 反向代理
    ↓
本机 PeerJS Signaling Server（server/peer-server.mjs）
```

- 游戏逻辑完全在浏览器中运行。
- 房主浏览器是权威节点。
- 普通玩家只发送命令、接收自己的 PlayerView。
- PeerJS Signaling 只转发 SDP/ICE，不是游戏服务器。

## 4. 环境变化对照

| 项目 | 旧实验室服务器 | 当前腾讯云轻量服务器 |
|---|---|---|
| 定位 | 共享科研/开发机 | 个人开发与部署机 |
| sudo | 不可用 | 可用 |
| 全局依赖 | 禁止 | 允许 |
| 生产服务 | 不适合长期运行 | 可运行 Web 静态站点或 Node 服务 |
| 项目操作边界 | 需要严格询问 | 仍建议谨慎，但不再有硬性禁止 |

## 5. 迁移/部署注意事项

- 纯前端版本优先使用静态托管；公网联机需要一个非常轻量的 PeerJS Signaling 进程。
- 该进程只做 WebRTC 信令，不保存游戏状态，不执行游戏规则。
- 密钥和配置不要提交到仓库，使用 `.env.example` 管理。
- 即使拥有 sudo，也应优先使用项目内依赖和普通用户运行服务。
- 使用 Docker 时，确保 Dockerfile/compose 都在项目内。

## 6. 历史遗留说明

- 旧文档中的“实验室服务器限制”“公共账号”“不能全局安装”等内容仅代表过去环境，已不再适用。
- 项目 git 历史保留完整开发记录，不删除旧说明。
## 7. 公网静态部署（Nginx）

当前仓库已经可以直接部署为公网静态站点。

```bash
npm run build:web
# 或一键部署到本机 Nginx
./scripts/deploy-static.sh
```

部署后：

- 静态文件位于 `/var/www/white-flower`
- Nginx 站点配置：`deploy/nginx-white-flower.conf`
- PeerJS Signaling 服务：`server/peer-server.mjs`，由 systemd 的 `white-flower-peer.service` 管理
- Nginx 将 `/peerjs` 反向代理到本机 `127.0.0.1:9000`
- 邀请链接会自动使用当前域名/IP，例如：
  - `http://服务器IP/?room=AB7K2P`
  - `https://你的域名/?room=AB7K2P`

> 公网可访问的前提：
> 1. 服务器安全组/防火墙允许 80/443 端口。
> 2. 如果使用域名，请将域名 A 记录解析到服务器 IP。
> 3. 生产环境强烈建议配置 HTTPS；WebRTC 在 HTTPS 下最可靠。
