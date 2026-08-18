# 部署架构与环境说明

> 最后更新：WebSocket Relay 生产架构
> 旧 WebRTC/PeerJS 保留为 fallback / 调试通道。

## 1. 当前环境定位

- 当前服务器：**个人腾讯云轻量服务器**。
- 当前用户：拥有 **sudo 权限**。
- 项目部署在 `/home/ubuntu/apps/White_Flower`。

## 2. 部署架构

```text
浏览器 (Host / Guest)
    ↓ HTTP/HTTPS
Nginx (80/443)
    ├── /            → 静态站点 packages/web-client/dist
    ├── /relay       → 127.0.0.1:9001 WebSocket Relay
    └── /peerjs      → 127.0.0.1:9000 PeerJS fallback
```

- GameEngine 只运行在房主浏览器。
- Relay 只负责消息转发，不运行游戏规则。
- Relay 绑定 `127.0.0.1:9001`，不直接暴露公网。

## 3. 本地开发

```bash
# Terminal A
npm run dev:relay

# Terminal B
npm run dev:web
```

打开 `http://localhost:5173`。

## 4. 一键部署

```bash
./scripts/deploy-static.sh
```

脚本会：

1. `npm run build:web`
2. 复制 `packages/web-client/dist` 到 `/var/www/white-flower`
3. 安装 Nginx 配置
4. 安装并启动 `white-flower-relay.service`
5. 安装并启动旧 `white-flower-peer.service`（WebRTC fallback）
6. `nginx -t && systemctl reload nginx`

## 5. systemd 服务

查看状态：

```bash
sudo systemctl status white-flower-relay.service --no-pager
sudo systemctl status white-flower-peer.service --no-pager
```

查看日志：

```bash
journalctl -u white-flower-relay.service -n 100 --no-pager
journalctl -u white-flower-relay.service -f
```

## 6. Nginx 关键配置

```nginx
location /relay {
    proxy_pass http://127.0.0.1:9001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}
```

## 7. 端口

- `80`：Nginx，公网访问。
- `9001`：WebSocket Relay，仅监听 `127.0.0.1`。
- `9000`：旧 PeerJS fallback，仅监听本机（如启用）。

安全组只需要开放 `80` / `443` / `22`，不需要开放 `9000` / `9001`。

## 8. 已知限制

- 房主必须保持页面在线。
- Relay 为单实例、内存房间；服务器重启会清空当前网络房间。
- 当前 HTTP 未加密；后续建议配置 HTTPS/WSS。
