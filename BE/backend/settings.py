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
OPENAI_API_KEY = env('OPENAI_API_KEY')

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

CORS_ALLOWED_ORIGINS = [ # 수정 FE(이 단락 전체)
    "http://localhost:5173",  # Vite 개발 환경의 프론트엔드 도메인
    "http://43.201.88.27",    # AWS 서버 IP
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


# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# JWT 인증 설정 (이미 되어 있음)
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    )
}

# ==========================================================
# 6. AI 모델 로드 설정 (파일 맨 아래)
# (이전에 추가했던 AI 모델 로더도 여기에 포함되어야 합니다)
# ==========================================================
try:
    from ai_model.prediction_utils import load_ai_model
    load_ai_model()
except ImportError:
    print("AI 모델 유틸리티를 로드하는 중 오류 발생 (무시하고 진행)")

