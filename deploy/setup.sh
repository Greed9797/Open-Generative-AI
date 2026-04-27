#!/bin/bash
# Run once on fresh VPS: bash setup.sh
set -e

echo "==> Updating system..."
apt-get update && apt-get upgrade -y

echo "==> Installing dependencies..."
apt-get install -y curl git nginx ffmpeg certbot python3-certbot-nginx ufw

echo "==> Installing Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

echo "==> Installing global packages..."
npm install -g pm2 hyperframes

echo "==> Configuring firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo "==> PM2 startup on boot..."
pm2 startup systemd -u root --hp /root | tail -1 | bash

echo ""
echo "==> Setup done. Next: run deploy.sh"
