from __future__ import annotations

from django.conf import settings

from .constants import DEFAULT_NOTIFICATION_TIMEOUT_MINUTES


def get_notification_timeout_minutes() -> float:
    """Resolve the reservation notification timeout (in minutes)."""
    minutes = getattr(settings, "WORKOUT_NOTIFICATION_TIMEOUT_MINUTES", None)
    if minutes is None:
        minutes = DEFAULT_NOTIFICATION_TIMEOUT_MINUTES
    try:
        return float(minutes)
    except Exception:
        # Fall back to default (15 seconds -> 0.25 minutes)
        return float(DEFAULT_NOTIFICATION_TIMEOUT_MINUTES or 0.25)


def get_notification_timeout_seconds() -> int:
    seconds = getattr(settings, "WORKOUT_NOTIFICATION_TIMEOUT_SECONDS", None)
    if seconds is not None:
        try:
            return max(1, int(float(seconds)))
        except Exception:
            pass
    minutes = get_notification_timeout_minutes()
    return max(1, int(minutes * 60))
