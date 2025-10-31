import os
from celery import Celery

# Django의 settings.py 파일을 Celery 설정으로 사용
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'Back.settings')

app = Celery('Back')

# Django settings.py에서 CELERY_로 시작하는 모든 설정 변수를 불러옴
app.config_from_object('django.conf:settings', namespace='CELERY')

# Django 앱들의 tasks.py 파일을 자동으로 찾아서 로드
app.autodiscover_tasks()