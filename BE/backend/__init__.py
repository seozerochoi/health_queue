# Celery autodiscover slows down gunicorn worker startup significantly.
# Only import celery when running celery worker/beat, not in web workers.
# If you need celery in gunicorn (e.g., for sending tasks), uncomment below
# but expect slower startup.

# from .celery import app as celery_app
# __all__ = ('celery_app',)

__all__ = ()
