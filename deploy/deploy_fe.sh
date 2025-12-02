#!/usr/bin/env bash
# FE 자동 배포 스크립트 (서버에서 실행)
# 사용법: ./deploy_fe.sh

set -e  # 에러 시 중단

echo "=========================================="
echo "  FE 배포 시작"
echo "=========================================="

# 설정
REPO_DIR="/home/ubuntu/health_queue"
FE_DIR="$REPO_DIR/FE"
NGINX_ROOT="/var/www/fe"

# 1. 최신 코드 가져오기
echo "📦 [1/5] Git pull..."
cd "$REPO_DIR"
git pull origin main

# 2. 의존성 설치
echo "📚 [2/5] npm install..."
cd "$FE_DIR"
npm install

# 3. 빌드
echo "🔨 [3/5] npm build..."
npm run build

# 4. Nginx 루트로 복사
echo "📂 [4/5] 빌드 결과물 복사..."
sudo rm -rf "$NGINX_ROOT/dist"
sudo mkdir -p "$NGINX_ROOT"
sudo cp -r "$FE_DIR/dist" "$NGINX_ROOT/"
sudo chown -R www-data:www-data "$NGINX_ROOT"
sudo chmod -R 755 "$NGINX_ROOT"

# 5. Nginx 재시작
echo "🔄 [5/5] Nginx reload..."
sudo nginx -t
sudo systemctl reload nginx

echo "=========================================="
echo "  ✅ FE 배포 완료!"
echo "  URL: http://$(hostname -I | awk '{print $1}')"
echo "=========================================="
