#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_ROOT="${WEB_ROOT:-/var/www/white-flower}"
NGINX_SITE="${NGINX_SITE:-white-flower}"
INSTALL_RELAY_SERVER="${INSTALL_RELAY_SERVER:-1}"
INSTALL_PEER_SERVER="${INSTALL_PEER_SERVER:-1}"
NODE_BIN="$(command -v node)"

echo "Building static site..."
cd "$ROOT_DIR"
npm run build:web

echo "Installing files to $WEB_ROOT..."
sudo mkdir -p "$WEB_ROOT"
sudo rm -rf "${WEB_ROOT:?}/"*
sudo cp -r packages/web-client/dist/* "$WEB_ROOT/"
sudo chown -R www-data:www-data "$WEB_ROOT"

echo "Installing Nginx config..."
sudo cp "$ROOT_DIR/deploy/nginx-white-flower.conf" "/etc/nginx/sites-available/$NGINX_SITE"
sudo ln -sf "/etc/nginx/sites-available/$NGINX_SITE" "/etc/nginx/sites-enabled/$NGINX_SITE"
sudo rm -f /etc/nginx/sites-enabled/default

if [ "$INSTALL_RELAY_SERVER" = "1" ]; then
    echo "Installing WebSocket Relay service..."
    sudo tee /etc/systemd/system/white-flower-relay.service >/dev/null <<SERVICE
[Unit]
Description=White_Flower WebSocket Relay
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=$ROOT_DIR
ExecStart=$NODE_BIN $ROOT_DIR/server/relay-server.mjs
Environment=PORT=9001
Environment=HOST=127.0.0.1
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
SERVICE
    sudo systemctl daemon-reload
    sudo systemctl enable white-flower-relay.service
    sudo systemctl restart white-flower-relay.service
fi

if [ "$INSTALL_PEER_SERVER" = "1" ]; then
    echo "Installing legacy PeerJS signaling service (for WebRTC fallback)..."
    sudo tee /etc/systemd/system/white-flower-peer.service >/dev/null <<SERVICE
[Unit]
Description=White_Flower PeerJS signaling server
After=network.target

[Service]
WorkingDirectory=$ROOT_DIR
ExecStart=$NODE_BIN $ROOT_DIR/server/peer-server.mjs
Restart=always
RestartSec=3
Environment=PORT=9000
Environment=PATH_PREFIX=/peerjs

[Install]
WantedBy=multi-user.target
SERVICE
    sudo systemctl daemon-reload
    sudo systemctl enable white-flower-peer.service
    sudo systemctl restart white-flower-peer.service
fi

echo "Testing Nginx..."
sudo nginx -t
sudo systemctl reload nginx

echo "Deploy complete: http://$(hostname -I | awk '{print $1}')/"
echo "WebSocket Relay: ws://<host>/relay"
echo "Legacy PeerJS: /peerjs (only for ?transport=webrtc)"
