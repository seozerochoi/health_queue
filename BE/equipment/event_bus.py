import json
import threading
from collections import deque
from typing import Any, Dict, List, Optional

from django.utils import timezone


class EquipmentEventBus:
    """A tiny in-process pub/sub used by the SSE endpoint."""

    def __init__(self, max_events: int = 500):
        self._cond = threading.Condition()
        self._events: deque[Dict[str, Any]] = deque(maxlen=max_events)
        self._seq = 0

    def publish(self, payload: Dict[str, Any], event_type: str = "update"):
        with self._cond:
            self._seq += 1
            event = {
                "seq": self._seq,
                "type": event_type,
                "payload": payload,
                "timestamp": timezone.now().isoformat(),
            }
            self._events.append(event)
            self._cond.notify_all()

    def wait_for_events(self, last_seq: int, timeout: float = 30.0):
        """
        Block until a new event with seq > last_seq is available or timeout elapses.
        Returns (events, new_last_seq, timed_out)
        """
        with self._cond:
            if self._seq > last_seq:
                events = [e for e in self._events if e["seq"] > last_seq]
                return events, self._seq, False

            self._cond.wait(timeout=timeout)
            if self._seq > last_seq:
                events = [e for e in self._events if e["seq"] > last_seq]
                return events, self._seq, False
            return [], last_seq, True


equipment_event_bus = EquipmentEventBus()


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
    """Convenience helper to emit an equipment update SSE message."""
    payload = _serialize_equipment(equipment)

    if waiting_count is None:
        from workouts.models import Reservation  # lazy import

        waiting_count = (
            Reservation.objects.filter(equipment=equipment, status="WAITING").count()
        )

    payload["waiting_count"] = waiting_count
    if extra:
        payload.update(extra)

    equipment_event_bus.publish(payload)


def publish_equipment_update_by_id(equipment_id: int):
    from equipment.models import Equipment  # lazy import

    try:
        equipment = Equipment.objects.get(pk=equipment_id)
    except Equipment.DoesNotExist:
        return
    publish_equipment_update(equipment)
