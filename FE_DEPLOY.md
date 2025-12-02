# FE 서버 배포 가이드

## 개요

React + Vite FE를 AWS EC2 + Nginx로 배포하는 가이드입니다.
소스 코드를 서버에 올리고 **서버에서 직접 빌드**하여 정적 파일을 Nginx로 서빙합니다.

## 전제 조건

- Ubuntu 서버 (EC2 등)
- Nginx 설치됨
- gunicorn으로 백엔드(Django) 실행 중 (포트 8000)
- 저장소 접근 권한 (git clone 가능)

---

## 1회 초기 설정

### 1.1 Node.js 설치

```bash
# Node.js 20.x LTS 설치
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 버전 확인
node --version  # v20.x
npm --version   # 10.x
```

### 1.2 저장소 클론

```bash
cd /home/ubuntu
git clone https://github.com/seozerochoi/health_queue.git
cd health_queue
```

### 1.3 Nginx 설정

```bash
# Nginx 설정 파일 복사
sudo cp deploy/nginx/fe.conf /etc/nginx/sites-available/health_queue

# 심볼릭 링크 생성 (활성화)
sudo ln -sf /etc/nginx/sites-available/health_queue /etc/nginx/sites-enabled/

# 기존 default 설정 비활성화 (선택사항)
sudo rm -f /etc/nginx/sites-enabled/default

# 설정 테스트
sudo nginx -t

# Nginx 재시작
sudo systemctl reload nginx
```

**주의**: `deploy/nginx/fe.conf` 파일에서 `server_name`을 실제 도메인 또는 IP로 수정하세요.

### 1.4 배포 디렉터리 생성

```bash
sudo mkdir -p /var/www/fe
sudo chown -R www-data:www-data /var/www/fe
sudo chmod -R 755 /var/www/fe
```

### 1.5 배포 스크립트 권한 부여

```bash
cd /home/ubuntu/health_queue/deploy
chmod +x deploy_fe.sh
```

---

## 배포 방법

### 자동 배포 (권장)

```bash
cd /home/ubuntu/health_queue/deploy
./deploy_fe.sh
```

스크립트가 자동으로:

1. 최신 코드 가져오기 (`git pull`)
2. 의존성 설치 (`npm install`)
3. 빌드 실행 (`npm run build`)
4. 빌드 결과물을 Nginx 루트로 복사
5. Nginx 재시작

### 수동 배포

```bash
# 1. 저장소 업데이트
cd /home/ubuntu/health_queue
git pull origin main

# 2. FE 빌드
cd FE
npm install
npm run build

# 3. Nginx로 복사
sudo rm -rf /var/www/fe/dist
sudo cp -r dist /var/www/fe/
sudo chown -R www-data:www-data /var/www/fe
sudo chmod -R 755 /var/www/fe

# 4. Nginx 재시작
sudo nginx -t
sudo systemctl reload nginx
```

---

## 접속 확인

### PC에서

```
http://43.201.88.27
또는
http://yourdomain.com
```

### 스마트폰에서

- 크롬/사파리에서 위 주소로 접속
- 같은 WiFi 또는 모바일 데이터로 접속 가능
- HTTPS 적용 시 보안 경고 없이 접속 가능

---

## HTTPS 적용 (선택사항, 권장)

도메인이 있는 경우 Let's Encrypt로 무료 SSL 인증서 발급:

```bash
# Certbot 설치
sudo apt-get update
sudo apt-get install -y certbot python3-certbot-nginx

# 인증서 발급 및 자동 설정
sudo certbot --nginx -d yourdomain.com

# 자동 갱신 확인
sudo certbot renew --dry-run
```

인증서는 90일마다 자동 갱신됩니다.

---

## 트러블슈팅

### 502 Bad Gateway

- gunicorn이 실행 중인지 확인:
  ```bash
  sudo systemctl status gunicorn
  ```
- Nginx 에러 로그 확인:
  ```bash
  sudo tail -f /var/log/nginx/fe_error.log
  ```

### 페이지가 안 열림 (404)

- Nginx 루트 경로 확인:
  ```bash
  ls -la /var/www/fe/dist
  # index.html, assets/ 폴더가 있어야 함
  ```

### SPA 라우팅 안됨 (새로고침 시 404)

- Nginx 설정에 `try_files $uri $uri/ /index.html;` 있는지 확인
- Nginx 재시작:
  ```bash
  sudo systemctl reload nginx
  ```

### 빌드가 느림

- 소형 인스턴스(t2.micro 등)에서는 빌드에 1-2분 소요 가능
- swap 메모리 추가로 개선 가능:
  ```bash
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  ```

### API 호출 실패 (CORS)

- FE와 BE가 같은 도메인에서 서빙되므로 CORS 문제는 없어야 함
- 브라우저 개발자 도구 Network 탭에서 `/api/` 요청 확인
- gunicorn이 8000 포트로 실행 중인지 확인

---

## 디렉터리 구조

```
/home/ubuntu/health_queue/
├── FE/
│   ├── src/
│   ├── dist/          # 빌드 결과물 (npm run build 후 생성)
│   ├── package.json
│   └── vite.config.ts
├── BE/
│   └── ...
└── deploy/
    ├── deploy_fe.sh   # 자동 배포 스크립트
    └── nginx/
        └── fe.conf    # Nginx 설정 파일

/var/www/fe/
└── dist/              # Nginx가 서빙하는 실제 파일
    ├── index.html
    └── assets/
```

---

## 배포 자동화 (선택사항)

GitHub Actions를 통해 push 시 자동 배포:

```yaml
# .github/workflows/deploy-fe.yml
name: Deploy FE

on:
  push:
    branches: [main]
    paths:
      - "FE/**"

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to server
        uses: appleboy/ssh-action@v0.1.10
        with:
          host: ${{ secrets.SERVER_IP }}
          username: ubuntu
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /home/ubuntu/health_queue/deploy
            ./deploy_fe.sh
```

Secrets 설정 필요:

- `SERVER_IP`: 서버 IP 주소
- `SSH_PRIVATE_KEY`: SSH 개인키

---

## 참고사항

- **빌드 시간**: 약 30초~2분 (인스턴스 사양에 따라)
- **디스크 사용량**: FE/node_modules (~500MB) + dist (~5MB)
- **메모리**: 빌드 시 최소 512MB 권장 (t2.micro는 swap 추가 권장)
- **업데이트 빈도**: 코드 변경 시마다 `./deploy_fe.sh` 실행

---

## 관련 파일

- `deploy/deploy_fe.sh`: 자동 배포 스크립트
- `deploy/nginx/fe.conf`: Nginx 설정 파일
- `FE/vite.config.ts`: Vite 빌드 설정
- `FE/package.json`: 의존성 및 빌드 명령

---

## 문의

배포 중 문제가 발생하면:

1. Nginx 로그 확인: `sudo tail -f /var/log/nginx/fe_error.log`
2. gunicorn 로그 확인: `sudo journalctl -u gunicorn -f`
3. 빌드 로그 확인: 터미널 출력 참조
