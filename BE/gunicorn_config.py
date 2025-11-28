# ============================================================
# Gunicorn Configuration for Health Queue Backend
# AWS EC2 (2 CPU, 2GB RAM) + nginx 최적화
# ============================================================

# ============================================================
# 1. 서버 바인드 설정
# ============================================================
# ⚡ CRITICAL: nginx와 통신하는 핵심 설정
# TCP 소켓: 원격 서버에서도 접근 가능 (이 경우는 localhost만 접근)
# Unix 소켓: 로컬 머신에서만 접근, 성능 우수 (권장)
bind = '127.0.0.1:8000'
# bind = 'unix:/tmp/gunicorn.sock'  # 성능 최적화 버전

# ============================================================
# 2. Worker 설정 (동시성 처리)
# ============================================================
# AWS 2 CPU 환경에 최적화
# 공식 권장: workers = (2 × CPU_cores) + 1 = (2 × 2) + 1 = 5
# SSE 연결이 worker를 점유하므로 실제로는 2~3개가 적절
workers = 2  # 2개 worker (안정적)

# Worker 클래스: sync + threads (동시성 확보)
worker_class = 'sync'

# 각 worker의 스레드 수
# - SSE 연결: 대부분 idle 상태 (connection 유지만 함)
# - API 요청: 동시 처리 필요
# 총 동시 처리 = workers × threads = 2 × 4 = 8개
threads = 2

# ============================================================
# 3. 타임아웃 설정
# ============================================================
# SSE는 장시간 연결을 유지하므로 충분히 긴 시간 설정 필수
timeout = 300  # 5분 (SSE heartbeat 포함)

# Graceful timeout: worker 종료 시 대기 시간
# systemd에서 TimeoutStopSec과 맞춰서 설정
graceful_timeout = 30

# PID 파일 (빠른 reload를 위해)
pidfile = '/tmp/gunicorn.pid'

# ============================================================
# 4. 로그 설정
# ============================================================
# ⚡ systemd journal로 로그를 보냄 (권장)
# stdout/stderr를 systemd가 수집 → journalctl로 확인 가능
loglevel = 'debug'
accesslog = '-'   # stdout으로 출력 (systemd journal 수집)
errorlog = '-'    # stderr로 출력 (systemd journal 수집)

# 로그 캡처 설정
capture_output = True
enable_stdio_inheritance = True

# ============================================================
# 5. 연결 설정
# ============================================================
# Keep-alive 연결 타임아웃
keepalive = 65

# 요청 라인/필드 제한
limit_request_line = 4096
limit_request_fields = 100

# ============================================================
# 6. 메모리/성능 최적화
# ============================================================
# Preload app: 각 worker가 독립적으로 앱 로드
# - True: 메모리 절약, 느린 재시작
# - False: 메모리 증가, 빠른 재시작 (현재 설정)
preload_app = False

# Worker 재시작 정책 (메모리 누수 방지)
# worker 당 처리 요청 수 초과 시 재시작
max_requests = 1000  # 1000개 요청 후 재시작
max_requests_jitter = 50  # ±50개 범위에서 무작위

# ============================================================
# 7. 요청 처리 (SSE 호환)
# ============================================================
# 청크 인코딩 지원 (SSE 필수)
chunked_transfer_encoding = True

# 버퍼링 비활성화 (SSE 필수)
# gunicorn이 응답을 버퍼링하면 SSE가 제때 도착하지 않음
# (하지만 gunicorn에는 직접 설정이 없고, nginx에서 처리)

