#!/bin/bash
# Run after editing .env.local: bash start.sh <domain>
# Subsequent redeploys: bash start.sh <domain>
set -e

DOMAIN=${1:?"Usage: start.sh <domain>"}
APP_DIR="/var/www/open-gen-ai"
APP_NAME="open-gen-ai"

cd "$APP_DIR"

echo "==> Installing dependencies..."
npm ci

echo "==> Building packages..."
npm run build:packages

echo "==> Building Next.js..."
npm run build

echo "==> Starting/restarting PM2..."
if pm2 list | grep -q "$APP_NAME"; then
  pm2 restart "$APP_NAME"
else
  pm2 start npm --name "$APP_NAME" -- start
fi
pm2 save

echo "==> Configuring Nginx..."
cp deploy/nginx.conf /etc/nginx/sites-available/"$DOMAIN"
sed -i "s/__DOMAIN__/$DOMAIN/g" /etc/nginx/sites-available/"$DOMAIN"
ln -sf /etc/nginx/sites-available/"$DOMAIN" /etc/nginx/sites-enabled/"$DOMAIN"
nginx -t && systemctl reload nginx

echo ""
echo "==> App running at http://$DOMAIN"
echo "==> To enable HTTPS:"
echo "   certbot --nginx -d $DOMAIN"
