# 部署架构与环境说明

> 最后更新：WebSocket Relay 生产架构
> 旧 WebRTC/PeerJS 保留为显式 fallback / 调试通道。

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

浏览器语音
    ├── STUN         → 发现公网候选地址
    └── TURN         → 无法直连时中继音频
```

- GameEngine 只运行在房主浏览器，不运行在 Relay 服务端。
- Relay 只负责消息转发，不运行游戏规则。
- Relay 绑定 `127.0.0.1:9001`，不直接暴露公网。
- WebSocket Relay 转发语音信令，不转发 MediaStream 音频。

## 3. 语音 TURN 配置

多人跨网络语音必须准备可公网访问的 TURN 服务。复制示例配置：

```bash
cp packages/web-client/.env.example packages/web-client/.env.production
```

然后填写：

```dotenv
VITE_VOICE_STUN_URLS=stun:stun.example.com:3478
VITE_VOICE_TURN_URLS=turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp,turns:turn.example.com:5349
VITE_VOICE_TURN_USERNAME=white-flower
VITE_VOICE_TURN_CREDENTIAL=使用强随机凭据
```

TURN 常见部署还需要在云安全组及系统防火墙开放 `3478/udp`、`3478/tcp`、可选的
`5349/tcp`，以及 TURN 配置使用的 UDP relay 端口范围。实际端口应以 TURN 服务配置为准。

这些变量会在 Vite 构建时写入浏览器包；TURN 凭据本来就需要交给浏览器，生产环境建议使用短期凭据。

## 4. 本地开发

```bash
# Terminal A
npm run dev:relay

# Terminal B
npm run dev:web
```

打开 `http://localhost:5173`。

前端生产构建：

```bash
npm run typecheck
npm test
npm run build:web
```

## 5. 一键部署

```bash
./scripts/deploy-static.sh
```

脚本会：

1. `npm run build:web`
2. 复制 `packages/web-client/dist` 到 `/var/www/white-flower`
3. 安装 Nginx 配置
4. 安装并启动 `white-flower-relay.service`
5. 安装并启动旧 `white-flower-peer.service`（仅 WebRTC fallback）
6. `nginx -t && systemctl reload nginx`

## 6. systemd 服务

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

## 7. Nginx 关键配置

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

## 8. 端口

- `80`：Nginx，公网访问。
- `9001`：WebSocket Relay，仅监听 `127.0.0.1`。
- `9000`：旧 PeerJS fallback，仅监听本机（如启用）。

安全组只需要开放 `80` / `443` / `22`，不需要开放 `9000` / `9001`。

## 9. 已知限制

- 房主必须保持页面在线。
- Relay 为单实例、内存房间；服务器重启会清空当前网络房间。
- 当前 HTTP 未加密；后续建议配置 HTTPS/WSS。
