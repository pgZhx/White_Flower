#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_ROOT="${WEB_ROOT:-/var/www/white-flower}"
NGINX_SITE="${NGINX_SITE:-white-flower}"

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

echo "Testing Nginx..."
sudo nginx -t
sudo systemctl reload nginx

echo "Deploy complete: http://$(hostname -I | awk '{print $1}')/"
