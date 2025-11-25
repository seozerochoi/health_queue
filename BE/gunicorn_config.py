# Gunicorn configuration file
# SSE 스트리밍을 위한 설정

# Worker 타임아웃 설정 (초 단위)
# SSE 연결은 장시간 유지되므로 충분히 긴 시간 설정
timeout = 300  # 5분

# Graceful timeout (worker를 graceful하게 종료할 때까지 기다리는 시간)
graceful_timeout = 300

# Worker 클래스: SSE 같은 비동기 스트리밍에는 gevent 또는 eventlet 권장
# 하지만 기본 sync worker도 작동 가능
worker_class = 'sync'

# Worker 프로세스 수 (CPU 코어 * 2 + 1 권장)
workers = 3

# 각 worker의 스레드 수
threads = 1

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
preload_app = False

# Max requests per worker (메모리 누수 방지)
max_requests = 1000
max_requests_jitter = 50
