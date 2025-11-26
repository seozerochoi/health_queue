# Gunicorn configuration file
# SSE 스트리밍 + 2core 2GB 환경 최적화 설정

# Worker 타임아웃 설정 (초 단위)
# SSE 연결은 장시간 유지되므로 충분히 긴 시간 설정
timeout = 300  # 5분

# Graceful timeout (worker를 graceful하게 종료할 때까지 기다리는 시간)
graceful_timeout = 300

# Worker 클래스: sync worker에 threads 추가하여 동시성 개선
# SSE는 대부분 idle 상태이므로 thread 방식이 효율적
worker_class = 'sync'

# Worker 프로세스 수
# 2core 환경: worker 2~3개 + threads 2~4개 조합 권장
# SSE 연결이 worker를 점유하므로 threads로 동시성 확보
workers = 2  # ⚡ 2core에서 2개 worker (메모리 절약)

# 각 worker의 스레드 수
# ⚡ CRITICAL: SSE 연결용 1개 + API 요청용 2~3개
threads = 4  # 각 worker가 4개 요청 동시 처리 = 총 8개 동시 처리 가능

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

# Preload app (메모리 절약, 하지만 코드 변경 시 재시작 필요)
# ⚡ 2GB RAM 환경에서 메모리 절약 위해 True 권장
preload_app = True

# Max requests per worker (메모리 누수 방지)
# ⚡ 더 자주 재시작하여 메모리 안정성 확보
max_requests = 500
max_requests_jitter = 50

# Worker 메모리 제한 (optional, requires setproctitle)
# 2GB 환경에서 worker당 400MB 제한 권장
# worker_tmp_dir = '/dev/shm'  # RAM disk 사용 (Linux only)
