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


def get_waiting_position(reservation) -> int | None:
    """Return 1-based waiting position for a reservation."""

    if reservation is None:
        return None

    # NOTIFIED users are effectively at the front of the queue
    if reservation.status == 'NOTIFIED':
        return 1
    if reservation.status != 'WAITING':
        return None

    from .models import Reservation  # avoid circular import at module load

    ahead_count = (
        Reservation.objects
        .filter(
            equipment_id=reservation.equipment_id,
            status='WAITING',
            created_at__lt=reservation.created_at,
        )
        .count()
    )
    return ahead_count + 1
