from celery import shared_task
from django.utils import timezone
from django.db import transaction
from datetime import timedelta
from .models import Reservation, UsageSession
from .session_management import cleanup_stale_sessions, finalize_session
from equipment.event_bus import publish_equipment_update_by_id
from typing import Optional


from .constants import DEFAULT_NOTIFICATION_TIMEOUT_MINUTES


@shared_task(bind=True)
def expire_notified_reservations(self, timeout_minutes: float = None, batch_size: int = 50):
    """
    Expire NOTIFIED reservations older than timeout_minutes and notify next waiting users.
    This task is intended to be run periodically (or scheduled per-reservation).
    """
    # Use the module-level DEFAULT_NOTIFICATION_TIMEOUT_MINUTES when caller doesn't pass a value
    if timeout_minutes is None:
        timeout_minutes = DEFAULT_NOTIFICATION_TIMEOUT_MINUTES
    cutoff = timezone.now() - timedelta(minutes=timeout_minutes)
    expired_total = 0
    notified_total = 0

    # Batch processing with select_for_update(skip_locked=True) for safety
    while True:
        with transaction.atomic():
            qs = (
                Reservation.objects.select_for_update(skip_locked=True)
                .filter(status='NOTIFIED', notified_at__lt=cutoff)
                .order_by('notified_at')[:batch_size]
            )

            reservations = list(qs)
            if not reservations:
                break

            touched_eq_ids = set()
            for r in reservations:
                r.status = 'EXPIRED'
                r.save()
                expired_total += 1
                touched_eq_ids.add(r.equipment_id)

                # notify next waiting
                next_r = (
                    Reservation.objects.filter(equipment=r.equipment, status='WAITING')
                    .order_by('created_at')
                    .first()
                )
                if next_r:
                    next_r.status = 'NOTIFIED'
                    next_r.notified_at = timezone.now()
                    next_r.save()
                    notified_total += 1
                    touched_eq_ids.add(next_r.equipment_id)
                    # TODO: enqueue/send FCM push notification for next_r.user

            if touched_eq_ids:
                def _emit(ids):
                    for eq_id in ids:
                        publish_equipment_update_by_id(eq_id)

                transaction.on_commit(lambda ids=list(touched_eq_ids): _emit(ids))

    return {'expired': expired_total, 'notified': notified_total}


@shared_task(bind=True)
def expire_active_sessions(self, batch_size: int = 50):
    """
    Find UsageSession rows that have passed their allocated_duration_minutes
    (i.e. should have ended) and end them automatically. For each ended
    session, mark the equipment AVAILABLE and notify the next waiting user
    (if any) by moving one WAITING -> NOTIFIED and setting notified_at.

    This is intended to be run periodically (e.g. every 30s or 1min) via
    Celery Beat.
    """
    now = timezone.now()
    ended = 0
    notified = 0

    while True:
        with transaction.atomic():
            qs = (
                UsageSession.objects.select_for_update(skip_locked=True)
                .filter(end_time__isnull=True)
                .order_by('start_time')[:batch_size]
            )

            sessions = list(qs)
            if not sessions:
                break

            for s in sessions:
                try:
                    expected_end = s.start_time + timedelta(minutes=s.allocated_duration_minutes)
                    if expected_end <= now:
                        finalize_session(s, now=now, reason='duration_expired')
                        ended += 1
                except Exception:
                    # if any row-specific error occurs, skip to next
                    continue

    return {'ended': ended, 'notified': notified}


@shared_task(bind=True)
def expire_stale_sessions(self, timeout_seconds: Optional[int] = None, batch_size: int = 20):
    """End sessions that have not sent a heartbeat within the configured timeout."""
    cleaned = cleanup_stale_sessions(timeout_seconds=timeout_seconds, batch_size=batch_size)
    return {'cleaned': cleaned}
