#!/bin/bash
set -euo pipefail

log() {
    TZ='Asia/Seoul' printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

export TMPDIR=/home/ubuntu/tmp
REMOTE=/home/ubuntu/health_queue_repo
BE_TARGET=/home/ubuntu/healthqueue
FE_TARGET=/var/www/fe

EXCLUDES=(
    --exclude='.env'
    --exclude='deploy/env'
    --exclude='venv/'
    --exclude='install.sh'
    --exclude='*.sh'
    --exclude='logs/'
    --exclude='.git/'
    --exclude='node_modules/'
    --exclude='__pycache__/'
    --exclude='media/'
)

# 디렉토리가 없으면 생성 및 clone
if [ ! -d "$REMOTE" ]; then
    log "[Setup] Cloning repository to $REMOTE"
    git clone https://github.com/seozerochoi/health_queue.git "$REMOTE"
fi

cd "$REMOTE"

log "[Start] git fetch origin"
git fetch origin

git reset --hard origin/main
log "git reset --hard origin/main 완료"

# ============================================================
# Backend 동기화
# ============================================================
rsync -a --delete "${EXCLUDES[@]}" "$REMOTE/BE/" "$BE_TARGET/"
log "BE rsync 동기화 완료"

cd /home/ubuntu/healthqueue
source venv/bin/activate
sudo systemctl restart redis
sleep 2
sudo systemctl restart myproject-celery-worker
sleep 2
sudo systemctl restart myproject-celery-beat
sleep 2
log "Redis/Celery 재기동 완료"

sudo systemctl reload gunicorn.service || sudo systemctl restart gunicorn
log "Gunicorn 재시작 완료"

# ============================================================
# Frontend 빌드 및 배포
# ============================================================
log "[FE] 빌드 시작"
cd "$REMOTE/FE"

# 의존성 설치 (package.json 변경 시만 실제 설치)
npm install --prefer-offline --no-audit
log "npm install 완료"

# 빌드
npm run build
log "npm build 완료"

# Nginx 루트로 복사
sudo rm -rf "$FE_TARGET/dist"
sudo mkdir -p "$FE_TARGET"
sudo cp -r "$REMOTE/FE/dist" "$FE_TARGET/"
sudo chown -R www-data:www-data "$FE_TARGET"
sudo chmod -R 755 "$FE_TARGET"
log "FE 배포 완료"

# Nginx 재시작
sudo nginx -t && sudo systemctl reload nginx
log "Nginx reload 완료"

log "[End] BE + FE 배포 스크립트 완료"
