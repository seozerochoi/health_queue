# workouts/constants.py
# Shared constants that don't require heavy dependencies like Celery

# Single source-of-truth for notification timeout (minutes). 
# Used by tasks.py, views.py, and serializers.py
DEFAULT_NOTIFICATION_TIMEOUT_MINUTES = 0.25
