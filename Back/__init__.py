# Django가 시작될 때 Celery 앱이 항상 로드되도록 보장
from .celery import app as celery_app

__all__ = ('celery_app',)