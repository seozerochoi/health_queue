import logging
from datetime import timedelta

from django.conf import settings
from django.db import models, transaction
from django.db.models import Q
from django.utils import timezone

from equipment.event_bus import publish_equipment_update
import logging
from datetime import timedelta
from typing import Optional

from django.conf import settings
from django.db import models, transaction
from django.db.models import Q
from django.utils import timezone

from equipment.event_bus import publish_equipment_update
from equipment.models import Equipment

from .models import Reservation, UsageSession

logger = logging.getLogger(__name__)

DEFAULT_HEARTBEAT_TIMEOUT_SECONDS = getattr(settings, "WORKOUT_HEARTBEAT_TIMEOUT_SECONDS", 45)


def notify_equipment_change(equipment: Optional[Equipment]):
    if equipment is None:
        return

    def _emit():
        publish_equipment_update(equipment)

    transaction.on_commit(_emit)


def finalize_session(session: UsageSession, now=None) -> Optional[Equipment]:
    if now is None:
        now = timezone.now()

    if session.end_time is not None:
        return None

    session.end_time = now
    session.save()

    equipment = Equipment.objects.select_for_update().get(pk=session.equipment.pk)
    equipment.status = 'AVAILABLE'
    equipment.save()

    notify_equipment_change(equipment)

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

    return equipment


def cleanup_stale_sessions(timeout_seconds: Optional[int] = None, batch_size: int = 20) -> int:
    if timeout_seconds is None:
        timeout_seconds = DEFAULT_HEARTBEAT_TIMEOUT_SECONDS

    cutoff = timezone.now() - timedelta(seconds=timeout_seconds)
    cleaned = 0

    while True:
        with transaction.atomic():
            qs = (
                UsageSession.objects.select_for_update(skip_locked=True)
                .filter(end_time__isnull=True)
                .filter(
                    Q(last_heartbeat__lt=cutoff)
                    | (Q(last_heartbeat__isnull=True) & Q(start_time__lt=cutoff))
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

    return cleaned
