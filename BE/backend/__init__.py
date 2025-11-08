from .celery import app as celery_app

# Ensure celery app is imported when Django starts
__all__ = ('celery_app',)
