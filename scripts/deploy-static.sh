#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_ROOT="${WEB_ROOT:-/var/www/white-flower}"
NGINX_SITE="${NGINX_SITE:-white-flower}"
INSTALL_PEER_SERVER="${INSTALL_PEER_SERVER:-1}"

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

if [ "$INSTALL_PEER_SERVER" = "1" ]; then
    echo "Installing PeerJS signaling service..."
    sudo tee /etc/systemd/system/white-flower-peer.service >/dev/null <<'SERVICE'
[Unit]
Description=White_Flower PeerJS signaling server
After=network.target

[Service]
WorkingDirectory=/home/ubuntu/apps/White_Flower
ExecStart=/usr/bin/node /home/ubuntu/apps/White_Flower/server/peer-server.mjs
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
