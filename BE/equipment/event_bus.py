import json
import threading
from collections import deque
from datetime import timedelta
from typing import Any, Dict, Optional
from urllib.parse import urlparse

import redis
from django.conf import settings
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)

REDIS_CHANNEL = "equipment_events"

def _get_redis_client():
    broker_url = getattr(settings, "CELERY_BROKER_URL", "redis://localhost:6379/0")
    parsed = urlparse(broker_url)
    return redis.Redis(host=parsed.hostname or "localhost", port=parsed.port or 6379, db=int((parsed.path or "/0").strip("/")))

_redis = _get_redis_client()

class LocalEventBuffer:
    """Local buffer used only for same-worker immediate access (optional)."""
    def __init__(self, max_events: int = 200):
        self._cond = threading.Condition()
        self._events: deque[Dict[str, Any]] = deque(maxlen=max_events)
        self._seq = 0

    def add(self, payload: Dict[str, Any], event_type: str = "update"):
        with self._cond:
            self._seq += 1
            self._events.append({
                "seq": self._seq,
                "type": event_type,
                "payload": payload,
                "timestamp": timezone.now().isoformat(),
            })
            self._cond.notify_all()

    def pop_new(self, last_seq: int):
        with self._cond:
            if self._seq > last_seq:
                return [e for e in self._events if e["seq"] > last_seq], self._seq
            return [], last_seq

local_buffer = LocalEventBuffer()


def _serialize_equipment(equipment) -> Dict[str, Any]:
    """Serialize minimal equipment fields for SSE consumers."""
    image = getattr(equipment, "image_url", None) or getattr(equipment, "image", "")
    return {
        "id": str(equipment.id),
        "name": equipment.name,
        "type": getattr(equipment, "type", None),
        "status": getattr(equipment, "status", None),
        "image_url": image,
        "base_session_time_minutes": getattr(
            equipment, "base_session_time_minutes", None
        ),
    }


def publish_equipment_update(equipment, waiting_count: Optional[int] = None, extra: Optional[Dict[str, Any]] = None):
    """Publish to Redis (cross-worker) and local buffer."""
    payload = _serialize_equipment(equipment)
    if waiting_count is None:
        from workouts.models import Reservation  # lazy import
        waiting_count = Reservation.objects.filter(
            equipment=equipment,
            status__in=["WAITING", "NOTIFIED"],
        ).count()
    payload["waiting_count"] = waiting_count
    if extra:
        payload.update(extra)
    try:
        _redis.publish(REDIS_CHANNEL, json.dumps({"type": "update", "payload": payload}))
        logger.info(f"📡 [EventBus] Redis publish equipment {equipment.id} waiting={waiting_count}")
    except Exception:
        logger.exception("❌ [EventBus] Redis publish 실패")
    # local buffer for same-worker subscribers
    local_buffer.add(payload, event_type="update")


def publish_equipment_update_by_id(equipment_id: int):
    from equipment.models import Equipment  # lazy import

    try:
        equipment = Equipment.objects.get(pk=equipment_id)
    except Equipment.DoesNotExist:
        return
    publish_equipment_update(equipment)


def publish_reservation_event(reservation, *, timeout_seconds: Optional[int] = None):
    if reservation is None:
        return
    equipment = reservation.equipment
    if timeout_seconds is None:
        try:
            from workouts.utils import get_notification_timeout_seconds  # lazy import
            timeout_seconds = get_notification_timeout_seconds()
        except Exception:
            timeout_seconds = 15
    notified_at = reservation.notified_at or timezone.now()
    expires_at = notified_at + timedelta(seconds=timeout_seconds)
    extra = {
        "payload_kind": "reservation",
        "equipment_name": equipment.name,
        "notified_reservation_id": reservation.id,
        "notified_user_id": reservation.user_id,
        "notified_username": getattr(reservation.user, "username", None),
        "notified_at": notified_at.isoformat(),
        "notification_timeout_seconds": timeout_seconds,
        "notification_expires_at": expires_at.isoformat(),
        "reservation_status": reservation.status,
    }
    publish_equipment_update(equipment, extra=extra)

def redis_subscribe_generator():
    """Yield messages from Redis Pub/Sub (cross-worker)."""
    pubsub = _redis.pubsub()
    pubsub.subscribe(REDIS_CHANNEL)
    for raw in pubsub.listen():
        if raw.get("type") == "message":
            try:
                data = json.loads(raw.get("data"))
                yield data
            except Exception:
                logger.exception("❌ [EventBus] Redis 메시지 파싱 실패")
