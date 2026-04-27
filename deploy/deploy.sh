#!/bin/bash
# First deploy: bash deploy.sh <repo-url> <domain>
# Example: bash deploy.sh https://github.com/user/repo.git app.seudominio.com
set -e

REPO_URL=${1:?"Usage: deploy.sh <repo-url> <domain>"}
DOMAIN=${2:?"Usage: deploy.sh <repo-url> <domain>"}
APP_DIR="/var/www/open-gen-ai"

echo "==> Cloning repo..."
git clone "$REPO_URL" "$APP_DIR"
cd "$APP_DIR"

echo "==> Creating .env (edit this file before continuing!)..."
cat > .env.local << 'EOF'
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
EOF

echo ""
echo "!! STOP: edit $APP_DIR/.env.local with your keys, then run:"
echo "   cd $APP_DIR && bash deploy/start.sh $DOMAIN"
