import logging
from datetime import timedelta
from typing import Optional

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from equipment.event_bus import publish_equipment_update
from equipment.models import Equipment

from .models import Reservation, UsageSession

logger = logging.getLogger(__name__)

DEFAULT_HEARTBEAT_TIMEOUT_SECONDS = getattr(settings, "WORKOUT_HEARTBEAT_TIMEOUT_SECONDS", 45)
DEFAULT_HEARTBEAT_START_GRACE_SECONDS = getattr(settings, "WORKOUT_HEARTBEAT_START_GRACE_SECONDS", 10)


def notify_equipment_change(equipment: Optional[Equipment]):
    if equipment is None:
        return

    def _emit():
        publish_equipment_update(equipment)

    transaction.on_commit(_emit)


def _release_equipment_to_available(equipment: Equipment, now=None):
    if now is None:
        now = timezone.now()

    equipment.status = 'AVAILABLE'
    equipment.save()

    next_waiting = (
        Reservation.objects.select_for_update(skip_locked=True)
        .filter(equipment=equipment, status='WAITING')
        .order_by('created_at')
        .first()
    )

    if next_waiting:
        next_waiting.status = 'NOTIFIED'
        next_waiting.notified_at = now
        next_waiting.save()

    notify_equipment_change(equipment)
    return equipment


def finalize_session(session: UsageSession, now=None) -> Optional[Equipment]:
    if now is None:
        now = timezone.now()

    if session.end_time is not None:
        return None

    session.end_time = now
    session.save()

    equipment = Equipment.objects.select_for_update().get(pk=session.equipment.pk)
    return _release_equipment_to_available(equipment, now=now)


def cleanup_stale_sessions(timeout_seconds: Optional[int] = None, grace_seconds: Optional[int] = None, batch_size: int = 20) -> int:
    if timeout_seconds is None:
        timeout_seconds = DEFAULT_HEARTBEAT_TIMEOUT_SECONDS
    if grace_seconds is None:
        grace_seconds = DEFAULT_HEARTBEAT_START_GRACE_SECONDS

    now = timezone.now()
    cutoff = now - timedelta(seconds=timeout_seconds)
    start_cutoff = now - timedelta(seconds=timeout_seconds + grace_seconds)
    cleaned = 0

    # Ensure equipments stuck in IN_USE without sessions get released as well.
    while True:
        with transaction.atomic():
            qs = (
                UsageSession.objects.select_for_update(skip_locked=True)
                .filter(end_time__isnull=True)
                .filter(
                    Q(last_heartbeat__lt=cutoff)
                    | (Q(last_heartbeat__isnull=True) & Q(start_time__lt=start_cutoff))
                )
                .order_by('last_heartbeat')[:batch_size]
            )

            sessions = list(qs)
            if not sessions:
                break

            for session in sessions:
                try:
                    finalize_session(session, now=timezone.now())
                except Exception as exc:
                    logger.exception("Failed to finalize stale session %s", session.pk, exc_info=exc)
                    continue
                cleaned += 1

    while True:
        with transaction.atomic():
            active_equipment_ids = list(
                UsageSession.objects.filter(end_time__isnull=True).values_list('equipment_id', flat=True)
            )
            stuck_qs = (
                Equipment.objects.select_for_update(skip_locked=True)
                .filter(status='IN_USE')
                .exclude(pk__in=active_equipment_ids)
            )[:batch_size]

            stuck_equipment = list(stuck_qs)
            if not stuck_equipment:
                break

            for equipment in stuck_equipment:
                try:
                    _release_equipment_to_available(equipment, now=timezone.now())
                except Exception as exc:
                    logger.exception("Failed to release stuck equipment %s", equipment.pk, exc_info=exc)
                    continue
                cleaned += 1

    return cleaned
