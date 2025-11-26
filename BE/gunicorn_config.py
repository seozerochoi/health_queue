# Gunicorn configuration file
# SSE 스트리밍 + 2core 2GB 환경 최적화 설정

# PID 파일 (빠른 reload를 위해)
pidfile = '/tmp/gunicorn.pid'

# Worker 타임아웃 설정 (초 단위)
# SSE 연결은 장시간 유지되므로 충분히 긴 시간 설정
timeout = 300  # 5분

# Graceful timeout (worker를 graceful하게 종료할 때까지 기다리는 시간)
# ⚡ 30초로 단축: 빠른 재시작 (SSE 연결은 자동 재연결)
graceful_timeout = 30

# Worker 클래스: sync worker에 threads 추가하여 동시성 개선
# SSE는 대부분 idle 상태이므로 thread 방식이 효율적
worker_class = 'sync'

# Worker 프로세스 수
# 2core 환경: worker 2~3개 + threads 2~4개 조합 권장
# SSE 연결이 worker를 점유하므로 threads로 동시성 확보
# ⚡ TEMPORARY FIX: 3개 탭 × SSE + API 요청 처리를 위해 증가
workers = 4  # ⚡ 4개 worker (메모리 감시 필요)

# 각 worker의 스레드 수
# ⚡ CRITICAL: SSE 연결용 1개 + API 요청용 2~3개
# ⚡ 6개로 증가: 총 24개 동시 처리 가능 (4 workers × 6 threads)
threads = 6

# Keep-alive 연결 타임아웃
keepalive = 65

# 로그 레벨
loglevel = 'info'

# Access log 형식
accesslog = '-'
errorlog = '-'

# 요청 처리 시간 제한 (SSE는 장시간이므로 충분히 설정)
# 주의: timeout과 다르게 실제 응답 데이터가 전송되는 시간
# SSE는 주기적으로 heartbeat를 보내므로 timeout이 더 중요
limit_request_line = 4096
limit_request_fields = 100

# Preload app (메모리 절약 vs 빠른 재시작 트레이드오프)
# ⚡ False로 변경: 각 워커가 독립적으로 로드 → 재시작 빠름
# ⚠️ 메모리는 약간 더 사용하지만, 개발/배포 시 리로드 속도 개선
preload_app = False

# Max requests per worker (메모리 누수 방지)
# ⚡ worker 수 증가로 더 자주 재시작하여 메모리 안정성 확보
max_requests = 300  # ⚡ 500 → 300 (worker가 많아서 더 자주 재시작)
max_requests_jitter = 30

# Worker 재시작 후 graceful shutdown
# 기존 요청 완료 후 종료
graceful_timeout = 30

# Worker 메모리 제한 (optional, requires setproctitle)
# 2GB 환경에서 worker당 400MB 제한 권장
# worker_tmp_dir = '/dev/shm'  # RAM disk 사용 (Linux only)
