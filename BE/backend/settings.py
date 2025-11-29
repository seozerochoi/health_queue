import os
import environ  # 1. django-environ import
from pathlib import Path

# ==========================================================
# 2. environ 설정 초기화 (파일 맨 위)
# ==========================================================
env = environ.Env(
    # DEBUG 모드를 기본적으로 False(서비스 모드)로 설정
    DEBUG=(bool, False)
)

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# 3. .env 파일 읽기 (로컬 테스트용)
# 이 코드가 .env 파일을 읽어서 환경 변수로 만들어줍니다.
environ.Env.read_env(os.path.join(BASE_DIR, '.env'))


# ==========================================================
# 4. 중요 설정들을 환경 변수에서 읽어오기
# ==========================================================
# .env 파일(로컬) 또는 클라우드타입의 환경 변수(서버)에서 값을 읽어옵니다.
SECRET_KEY = env('SECRET_KEY')
DEBUG = env('DEBUG')
OPENAI_API_KEY = env('OPENAI_API_KEY', default='')
# AWS region for Rekognition fallback in InBody analyze
# Prefer AWS_REGION, fallback to AWS_DEFAULT_REGION if present
AWS_REGION = env('AWS_REGION', default=os.getenv('AWS_DEFAULT_REGION'))
INBODY_GPT_ENABLED = env.bool('INBODY_GPT_ENABLED', default=True)

# 클라우드타입이 제공하는 도메인을 허용해야 합니다.
# ['*']는 모든 주소를 허용하는 가장 간단한 설정입니다.
ALLOWED_HOSTS = ['*']


# Application definition
# (우리가 만든 모든 앱을 여기에 등록합니다)
INSTALLED_APPS = [
    'corsheaders', # 수정 FE
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Third-party apps
    'rest_framework',
    'rest_framework_simplejwt',

    # Local apps (우리가 만든 모든 앱!)
    'users.apps.UsersConfig',
    'gyms.apps.GymsConfig',
    'equipment.apps.EquipmentConfig',
    'workouts.apps.WorkoutsConfig',
    'reports.apps.ReportsConfig',
    'routines.apps.RoutinesConfig',
    'ai_model', # ai_model 폴더
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware', # 수정 FE
    'backend.middleware.MediaCorsMiddleware',  # Custom CORS for media files
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'backend.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

# ------------------------------------------------------------------
# CORS / SSE 설정
# ------------------------------------------------------------------
# 프론트엔드 배포 지점이 수시로 바뀌어도 막히지 않도록 기본값은 모든
# 오리진을 허용하고, 인증은 JWT Authorization 헤더/쿼리 파라미터로 처리.
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True  # 추가: 쿠키/인증 정보 허용
# EventSource에서 cache-control, authorization 등을 허용하도록 헤더 화이트리스트
CORS_ALLOW_HEADERS = [
    "accept",
    "accept-encoding",
    "authorization",
    "content-type",
    "dnt",
    "origin",
    "user-agent",
    "x-csrftoken",
    "x-requested-with",
    "cache-control",
]
CORS_EXPOSE_HEADERS = [
    "Content-Type",
    "X-CSRFToken",
    "Content-Disposition",
    "Content-Length",
]
# SSE를 위한 메서드 허용
CORS_ALLOW_METHODS = [
    'DELETE',
    'GET',
    'OPTIONS',
    'PATCH',
    'POST',
    'PUT',
]

# CSRF 설정 - 미디어 파일 접근 허용
CSRF_TRUSTED_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://43.201.88.27',
    'https://43.201.88.27',
]

WSGI_APPLICATION = 'backend.wsgi.application'


# ==========================================================
# 5. DATABASES 설정 (가장 중요!)
# ==========================================================
# 이 한 줄이 DATABASE_URL 환경 변수를 자동으로 읽어
# 로컬 DB든 클라우드타입 DB든 알아서 연결해줍니다.
# (사용자님의 기존 하드코딩된 DB 설정을 이것으로 대체합니다)
DATABASES = {
    'default': env.db(),
}

# ⚡ DB 연결 풀 설정 (성능 최적화)
# Django는 기본적으로 각 요청마다 새 DB 연결을 생성/삭제
# 연결 풀을 사용하면 연결을 재사용하여 응답 속도 향상
#DATABASES['default']['CONN_MAX_AGE'] = 10  # 연결 유지 시간 (10초)
DATABASES['default']['OPTIONS'] = {
    'connect_timeout': 10,  # 연결 타임아웃 (초)
}

# PostgreSQL 사용 시 추가 최적화
if DATABASES['default'].get('ENGINE', '').endswith('postgresql'):
    DATABASES['default']['OPTIONS'].update({
        'keepalives': 1,  # TCP keep-alive 활성화
        'keepalives_idle': 30,
        'keepalives_interval': 10,
        'keepalives_count': 5,
    })


# Password validation
# (기존 내용 그대로)
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
# (기존 내용 그대로)
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True


# Static files (CSS, JavaScript, Images)
STATIC_URL = 'static/'
# 클라우드타입 같은 배포 환경에서 정적 파일을 모으는 경로입니다.
# (배포를 위해 꼭 필요한 설정입니다)
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')

# Media files (user uploads)
MEDIA_URL = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')


# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# JWT 인증 설정 (이미 되어 있음)
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    )
}

WORKOUT_HEARTBEAT_TIMEOUT_SECONDS = 60
WORKOUT_HEARTBEAT_START_GRACE_SECONDS = 30

# Simple JWT 설정: 액세스/리프레시 토큰 수명 연장
from datetime import timedelta

SIMPLE_JWT = {
    # 액세스 토큰 유효 시간 (예: 150분)
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=150),
    # 리프레시 토큰 유효 시간 (예: 7일)
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    # 리프레시 토큰 회전 사용 여부 (회전 사용 시 추가 구현 권장)
    'ROTATE_REFRESH_TOKENS': False,
    'BLACKLIST_AFTER_ROTATION': False,
    'ALGORITHM': 'HS256',
    'SIGNING_KEY': SECRET_KEY,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# ==========================================================
# 6. AI 모델 로드 설정 (파일 맨 아래)
# (이전에 추가했던 AI 모델 로더도 여기에 포함되어야 합니다)
# ==========================================================
# NOTE: Do NOT eagerly load AI models at settings import time. Loading
# large ML models here slows down process start/restart (gunicorn workers).
# The ai_model module exposes a lazy loader; the model will be loaded on
# first use inside the prediction utilities.

# ==========================================================
# Celery 설정
# ==========================================================
# 브로커 URL은 .env 또는 환경변수로 설정하세요. 기본은 로컬 Redis입니다.
CELERY_BROKER_URL = env('CELERY_BROKER_URL', default='redis://localhost:6379/0')
CELERY_RESULT_BACKEND = env('CELERY_RESULT_BACKEND', default=CELERY_BROKER_URL)

# Beat 스케줄: expire task를 주기적으로 실행하여 NOTIFIED 예약 만료 처리를 수행합니다.
# ⚡ 30초 → 60초로 변경: 2GB RAM 환경에서 CPU/DB 부하 감소
CELERY_BEAT_SCHEDULE = {
    'expire-reservations-every-60s': {
        'task': 'workouts.tasks.expire_notified_reservations',
        'schedule': 60.0,  # 30초 → 60초 (CPU 부하 50% 감소)
        'args': (),
    },
    'expire-stale-sessions-every-60s': {
        'task': 'workouts.tasks.expire_stale_sessions',
        'schedule': 60.0,  # 30초 → 60초
        'args': (),
    },
}

# SSE polling frequency used by the simple equipment_stream prototype. Lower
# values make the UI more responsive but increase DB load. Tune for your
# deployment; we recommend 2-5 seconds for small deployments, 10+ for larger.
# ⚡ 30초 → 60초로 변경: 2GB RAM 환경에서 DB 폴링 50% 감소
EQUIPMENT_SSE_POLL_INTERVAL_SECONDS = 60

# SSE Heartbeat 설정 (60초마다 ping 전송)
# ⚡ 30초 → 60초로 증가하여 API 요청 부하 감소
EQUIPMENT_SSE_HEARTBEAT_SECONDS = 60


LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "[%(asctime)s] %(levelname)s %(name)s %(message)s",
            "datefmt": "%Y-%m-%d %H:%M:%S",
        },
        "detailed": {
            "format": "[%(asctime)s] %(levelname)s %(name)s:%(lineno)d - %(funcName)s() - %(message)s",
            "datefmt": "%Y-%m-%d %H:%M:%S",
        }
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
        "detailed_console": {
            "class": "logging.StreamHandler",
            "formatter": "detailed",
        }
    },
    "loggers": {
        "": {
            "handlers": ["console"],
            "level": "DEBUG" if DEBUG else "INFO",
        },
        "django": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
        "django.request": {
            "handlers": ["detailed_console"],
            "level": "DEBUG",  # 모든 API 요청 상세 로깅
            "propagate": False,
        },
        "django.db.backends": {
            "handlers": ["detailed_console"],
            "level": "DEBUG",  # ⚡ DB 쿼리 로깅 (성능 분석 용)
            "propagate": False,
        },
        "users": {
            "handlers": ["detailed_console"],
            "level": "DEBUG",  # 모든 user 관련 로그
            "propagate": False,
        },
        "gyms": {
            "handlers": ["detailed_console"],
            "level": "DEBUG",  # gyms API 로그
            "propagate": False,
        },
        "equipment": {
            "handlers": ["detailed_console"],
            "level": "DEBUG",  # equipment API 로그
            "propagate": False,
        },
        "workouts": {
            "handlers": ["detailed_console"],
            "level": "DEBUG",  # workouts API 로그
            "propagate": False,
        },
        "reports": {
            "handlers": ["detailed_console"],
            "level": "DEBUG",  # reports API 로그
            "propagate": False,
        },
        "routines": {
            "handlers": ["detailed_console"],
            "level": "DEBUG",  # routines API 로그
            "propagate": False,
        },
        "ai_model": {
            "handlers": ["detailed_console"],
            "level": "DEBUG",  # AI 모델 로그
            "propagate": False,
        },
        "gunicorn.error": {
            "handlers": ["console"],
            "level": "INFO",  # 에러만 로깅
            "propagate": False,
        },
        "gunicorn.access": {
            "handlers": ["console"],
            "level": "INFO",  # ✅ 모든 HTTP 요청 로깅
            "propagate": False,
        },
        "equipment.views": {
            "handlers": ["console"],
            "level": "INFO",  # SSE 로그
            "propagate": False,
        },
        "equipment.event_bus": {
            "handlers": ["console"],
            "level": "WARNING",
            "propagate": False,
        },
    },
}


