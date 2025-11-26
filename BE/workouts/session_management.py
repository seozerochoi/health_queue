import logging
from datetime import timedelta
from typing import Optional

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from equipment.event_bus import publish_equipment_update, publish_reservation_event
from equipment.models import Equipment

from .models import Reservation, UsageSession
from .utils import get_notification_timeout_seconds

logger = logging.getLogger(__name__)

DEFAULT_HEARTBEAT_TIMEOUT_SECONDS = getattr(settings, "WORKOUT_HEARTBEAT_TIMEOUT_SECONDS", 45)
DEFAULT_HEARTBEAT_START_GRACE_SECONDS = getattr(settings, "WORKOUT_HEARTBEAT_START_GRACE_SECONDS", 10)


def notify_equipment_change(equipment: Optional[Equipment]):
    if equipment is None:
        return

    # 트랜잭션 커밋 후 이벤트 발행 (비동기 처리)
    def _emit():
        logger.info(f"🔔 [SSE] Equipment {equipment.id} ({equipment.name}) 상태 변경 이벤트 발행 - status: {equipment.status}")
        publish_equipment_update(equipment)

    # 트랜잭션이 아직 진행 중인지 확인
    try:
        from django.db import connection
        if connection.in_atomic_block:
            # 트랜잭션 내부에서 호출됨 - 커밋 후 실행
            transaction.on_commit(_emit)
            logger.debug(f"🕒 [SSE] Equipment {equipment.id} 이벤트 예약됨 (트랜잭션 커밋 후 실행)")
        else:
            # 트랜잭션 외부에서 호출됨 - 즉시 실행
            _emit()
            logger.debug(f"⚡ [SSE] Equipment {equipment.id} 이벤트 즉시 발행됨")
    except Exception as e:
        logger.exception(f"❌ [SSE] Equipment {equipment.id} 이벤트 발행 실패")
        # 실패해도 일단 시도
        _emit()


def cancel_active_reservation(reservation: Reservation, now=None) -> dict[str, Optional[int]]:
    """Mark a WAITING/NOTIFIED reservation as expired and promote the next user.

    Returns a summary dict with the updated waiting_count and identifier of the
    reservation that was promoted to NOTIFIED (if any).
    """

    if reservation is None:
        return {"waiting_count": 0, "next_reservation_id": None, "status_was_active": False}

    if now is None:
        now = timezone.now()

    with transaction.atomic():
        # Re-lock the reservation and its equipment to avoid race conditions.
        reservation = (
            Reservation.objects.select_for_update()
            .select_related("equipment")
            .get(pk=reservation.pk)
        )
        equipment = Equipment.objects.select_for_update().get(pk=reservation.equipment_id)

        status_was_active = reservation.status in ("WAITING", "NOTIFIED")
        next_reservation = None

        if status_was_active:
            reservation.status = "EXPIRED"
            reservation.save(update_fields=["status", "notified_at"])

            if equipment.status != "IN_USE":
                next_reservation = notify_next_waiter(equipment, now=now)

        queue_qs = Reservation.objects.filter(
            equipment=equipment,
            status__in=["WAITING", "NOTIFIED"],
        )
        waiting_count = queue_qs.count()
        queue_exists = waiting_count > 0

        status_changed = False
        if equipment.status != "IN_USE":
            desired_status = "WAITING" if queue_exists else "AVAILABLE"
            if equipment.status != desired_status:
                equipment.status = desired_status
                equipment.save(update_fields=["status"])
                status_changed = True

        # 장비 status가 변경된 경우에는 post_save signal이 이미 SSE 발행 -> 중복 방지를 위해 skip
        # status 미변경이지만 대기열 변화가 있었다면 waiting_count 값 반영 위해 직접 발행
        if status_was_active and not status_changed:
            notify_equipment_change(equipment)

    return {
        "waiting_count": waiting_count,
        "next_reservation_id": next_reservation.id if next_reservation else None,
        "status_was_active": status_was_active,
    }


def mark_reservation_notified(reservation: Optional[Reservation], now=None) -> Optional[Reservation]:
    if reservation is None:
        return None

    if now is None:
        now = timezone.now()

    reservation.status = 'NOTIFIED'
    reservation.notified_at = now
    reservation.save()

    publish_reservation_event(
        reservation,
        timeout_seconds=get_notification_timeout_seconds(),
    )
    return reservation


def notify_next_waiter(equipment: Equipment, now=None) -> Optional[Reservation]:
    next_waiting = (
        Reservation.objects.select_for_update(skip_locked=True)
        .filter(equipment=equipment, status='WAITING')
        .order_by('created_at')
        .first()
    )

    if not next_waiting:
        return None

    return mark_reservation_notified(next_waiting, now=now)


def _release_equipment_to_available(equipment: Equipment, now=None):
    if now is None:
        now = timezone.now()

    # 먼저 다음 대기자를 NOTIFIED로 승격 시도
    next_waiting = notify_next_waiter(equipment, now=now)

    # 대기열 존재 여부를 WAITING/NOTIFIED 모두 포함해 재검사하여
    # 장비 상태가 AVAILABLE로 잘못 떨어지는 것을 방지한다.
    from .models import Reservation  # lazy import to avoid circular import at module load
    queue_exists = Reservation.objects.filter(
        equipment=equipment,
        status__in=["WAITING", "NOTIFIED"],
    ).exists()

    if queue_exists or next_waiting:
        equipment.status = 'WAITING'
    else:
        equipment.status = 'AVAILABLE'

    # ⚡ update_fields 지정 → Signal에서 자동 발행 (notify 호출 불필요)
    equipment.save(update_fields=['status'])
    return equipment


def finalize_session(session: UsageSession, now=None, *, reason: Optional[str] = None) -> Optional[Equipment]:
    if now is None:
        now = timezone.now()

    if session.end_time is not None:
        return None

    session.end_time = now
    session.save()

    equipment = Equipment.objects.select_for_update().get(pk=session.equipment.pk)
    released = _release_equipment_to_available(equipment, now=now)
    logger.info(
        "Finalized session %s (equipment %s) reason=%s",
        session.pk,
        session.equipment_id,
        reason or 'unspecified',
    )
    return released


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
                    finalize_session(session, now=timezone.now(), reason='heartbeat_timeout')
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
                    logger.info(
                        "Released stuck IN_USE equipment %s without active session",
                        equipment.pk,
                    )
                except Exception as exc:
                    logger.exception("Failed to release stuck equipment %s", equipment.pk, exc_info=exc)
                    continue
                cleaned += 1

    while True:
        with transaction.atomic():
            waiting_qs = (
                Equipment.objects.select_for_update(skip_locked=True)
                .filter(status='WAITING')
                .exclude(
                    pk__in=Reservation.objects.filter(
                        status__in=['WAITING', 'NOTIFIED']
                    ).values('equipment_id')
                )
            )[:batch_size]

            waiting_equipment = list(waiting_qs)
            if not waiting_equipment:
                break

            for equipment in waiting_equipment:
                try:
                    equipment.status = 'AVAILABLE'
                    equipment.save(update_fields=['status'])  # ⚡ Signal에서 자동 발행
                    logger.info(
                        "Released WAITING equipment %s with empty queue",
                        equipment.pk,
                    )
                except Exception as exc:
                    logger.exception(
                        "Failed to release empty-queue equipment %s",
                        equipment.pk,
                        exc_info=exc,
                    )
                    continue
                cleaned += 1

    return cleaned
