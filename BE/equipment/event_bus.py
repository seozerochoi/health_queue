import json
import threading
import time
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
OPERATOR_CHANNEL = "operator_notifications"

def _get_redis_client():
    broker_url = getattr(settings, "CELERY_BROKER_URL", "redis://localhost:6379/0")
    parsed = urlparse(broker_url)
    # ⚡ CRITICAL: Add socket_timeout and socket_connect_timeout to prevent blocking
    # If Redis is down, fail fast (3s) instead of hanging for 60+ seconds
    return redis.Redis(
        host=parsed.hostname or "localhost",
        port=parsed.port or 6379,
        db=int((parsed.path or "/0").strip("/")),
        socket_timeout=3.0,  # Read/write timeout
        socket_connect_timeout=3.0,  # Connection timeout
        socket_keepalive=True,
        socket_keepalive_options={},
        retry_on_timeout=False,  # Don't retry on timeout
    )

# ⚡ CRITICAL: Do NOT create global Redis connection at module load time!
# When preload_app=True in Gunicorn, all workers share the same connection object
# which causes cross-worker communication failures. Create fresh connection per use.
_redis = None

def _get_redis_publisher():
    """Get or create Redis client for publishing (lazy initialization per worker)."""
    global _redis
    if _redis is None:
        _redis = _get_redis_client()
        logger.info("🔌 [EventBus] Redis publisher initialized for this worker")
    return _redis

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

# ---------------------------------------------------------------------------
# Backward compatibility shim: legacy 'equipment_event_bus' with wait_for_events
# ---------------------------------------------------------------------------
class _LegacyEquipmentEventBus:
    """Provide legacy interface so older code importing equipment_event_bus does not crash.

    wait_for_events(last_seq, timeout) -> (events, new_last_seq, timed_out)
    Uses LocalEventBuffer's condition variable to wait up to `timeout` seconds for new events.
    """
    def wait_for_events(self, last_seq: int, timeout: int = 10):
        deadline = time.time() + timeout
        # fast path: immediately return if there are new events
        events, current_seq = local_buffer.pop_new(last_seq)
        if events:
            return events, current_seq, False
        # blocking wait
        remaining = deadline - time.time()
        if remaining <= 0:
            return [], last_seq, True
        with local_buffer._cond:  # type: ignore[attr-defined]
            local_buffer._cond.wait(timeout=remaining)
        events, current_seq = local_buffer.pop_new(last_seq)
        timed_out = len(events) == 0
        return events, current_seq, timed_out

equipment_event_bus = _LegacyEquipmentEventBus()


def _serialize_equipment(equipment) -> Dict[str, Any]:
    """Serialize minimal equipment fields for SSE consumers."""
    image = getattr(equipment, "image_url", None) or getattr(equipment, "image", "")
    return {
        "id": str(equipment.id),
        "equipment_id": equipment.id,  # 추가: 숫자 형식의 equipment_id도 포함
        "name": equipment.name,
        "type": getattr(equipment, "type", None),
        "status": getattr(equipment, "status", None),
        "operational_state": getattr(equipment, "operational_state", None),
        "image_url": image,
        "base_session_time_minutes": getattr(
            equipment, "base_session_time_minutes", None
        ),
    }


def publish_equipment_update(equipment, waiting_count: Optional[int] = None, extra: Optional[Dict[str, Any]] = None):
    """Publish to Redis (cross-worker).
    
    Args:
        equipment: Equipment instance
        waiting_count: Pre-calculated waiting count. If None, will query DB (slower)
        extra: Additional fields to include in payload (e.g., reservation positions)
    """
    import time
    start_time = time.time()
    
    payload = _serialize_equipment(equipment)
    serialize_time = time.time()
    
    # ⚡ Use pre-calculated waiting_count if provided, otherwise query DB
    if waiting_count is None:
        from workouts.models import Reservation  # lazy import
        waiting_count = Reservation.objects.filter(
            equipment=equipment,
            status__in=["WAITING", "NOTIFIED"],
        ).count()
        logger.warning(f"⚠️ [EventBus] waiting_count not provided, querying DB (slow!)")
    
    payload["waiting_count"] = waiting_count
    
    # 🔔 추가: 대기열의 모든 예약 position 정보를 함께 전송하여 클라이언트가 자기 순번을 재계산 가능하도록 함
    try:
        from workouts.models import Reservation
        from workouts.utils import get_waiting_position
        queue = Reservation.objects.filter(
            equipment=equipment,
            status__in=["WAITING", "NOTIFIED"],
        ).order_by('created_at').values('id', 'user_id', 'status')
        
        # position 정보 리스트: [{reservation_id, user_id, position, status}, ...]
        queue_positions = []
        for idx, res in enumerate(queue, start=1):
            queue_positions.append({
                "reservation_id": res['id'],
                "user_id": res['user_id'],
                "position": idx,
                "status": res['status'],
            })
        payload["queue_positions"] = queue_positions
        logger.debug(f"[EventBus] Equipment {equipment.id} queue_positions: {queue_positions}")
    except Exception as e:
        logger.warning(f"[EventBus] Failed to calculate queue_positions for equipment {equipment.id}: {e}")
        payload["queue_positions"] = []
    
    if extra:
        payload.update(extra)
    
    prepare_time = time.time()
    
    # ⚡ CRITICAL: Redis publish with timeout protection
    # If Redis is down, log error and continue instead of blocking the request
    try:
        redis_client = _get_redis_publisher()
        redis_client.publish(REDIS_CHANNEL, json.dumps({"type": "update", "payload": payload}))
        redis_time = time.time()
        
        total_time = redis_time - start_time
        logger.info(
            f"⏱️ [EventBus] SSE Publish timing - "
            f"serialize: {(serialize_time - start_time)*1000:.1f}ms, "
            f"prepare: {(prepare_time - serialize_time)*1000:.1f}ms, "
            f"redis: {(redis_time - prepare_time)*1000:.1f}ms, "
            f"total: {total_time*1000:.1f}ms | "
            f"equipment {equipment.id} waiting={waiting_count}"
        )
    except redis.exceptions.ConnectionError as e:
        logger.error(f"❌ [EventBus] Redis 연결 실패 (equipment {equipment.id}): {e}")
        # Continue execution - SSE clients will get updates on reconnect
    except redis.exceptions.TimeoutError as e:
        logger.error(f"❌ [EventBus] Redis 타임아웃 (equipment {equipment.id}): {e}")
        # Continue execution
    except Exception as e:
        logger.exception(f"❌ [EventBus] Redis publish 실패 (equipment {equipment.id}): {e}")
        # Continue execution
    
    # ⚡ REMOVED: Do NOT add to local_buffer
    # Local buffer causes race conditions when multiple workers handle different events.
    # All events should flow through Redis for consistency across workers.
    # local_buffer.add(payload, event_type="update")  # REMOVED


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


def publish_operator_notification(event_type: str, payload: Dict[str, Any]):
    """
    운영자에게 알림을 전송합니다 (신고, 기구 고장 등).
    
    Args:
        event_type: 알림 타입 ('report_created', 'equipment_broken', etc.)
        payload: 알림 데이터 (report_id, equipment_id, gym_id 등)
    """
    import time
    start_time = time.time()
    
    message = {
        "type": event_type,
        "payload": payload,
        "timestamp": timezone.now().isoformat(),
    }
    
    try:
        redis_client = _get_redis_publisher()
        redis_client.publish(OPERATOR_CHANNEL, json.dumps(message))
        
        elapsed = (time.time() - start_time) * 1000
        logger.info(
            f"📢 [OperatorNotification] Published {event_type} to operators - "
            f"elapsed: {elapsed:.1f}ms | payload: {payload}"
        )
    except redis.exceptions.ConnectionError as e:
        logger.error(f"❌ [OperatorNotification] Redis 연결 실패: {e}")
    except redis.exceptions.TimeoutError as e:
        logger.error(f"❌ [OperatorNotification] Redis 타임아웃: {e}")
    except Exception as e:
        logger.exception(f"❌ [OperatorNotification] Redis publish 실패: {e}")


def redis_subscribe_generator(max_backoff_seconds: int = 30):
    """Redis Pub/Sub generator with auto-reconnect & non-blocking backoff.

    Behavior:
    - Yields parsed message dicts with keys: {type, payload}
    - On connection failure, yields None immediately (so caller loop can send heartbeat)
      then performs progressive backoff without blocking the caller for the full delay.
    - Backoff doubles up to `max_backoff_seconds`.
    - Resets backoff after a successful message receipt.
    """
    backoff_attempt = 0
    reconnect_wait_until: Optional[float] = None

    pubsub = None

    def _connect_pubsub():
        nonlocal pubsub, backoff_attempt, reconnect_wait_until
        try:
            client = _get_redis_client()
            pubsub = client.pubsub(ignore_subscribe_messages=True)
            pubsub.subscribe(REDIS_CHANNEL)
            logger.info("🔌 [EventBus] Redis 구독 연결 수립")
            backoff_attempt = 0
            reconnect_wait_until = None
            return True
        except Exception as e:
            logger.warning(f"⚠️ [EventBus] Redis 구독 연결 실패: {e}")
            return False

    # 초기 연결 시도
    _connect_pubsub()

    while True:
        # 재연결 대기 중이면 즉시 None yield 후 잠깐 sleep -> 외부 루프 heartbeat 가능
        if reconnect_wait_until and time.time() < reconnect_wait_until:
            yield None
            time.sleep(0.5)
            continue

        if pubsub is None:
            # 연결이 전혀 없는 상태 -> backoff 설정 후 재시도 준비
            backoff_attempt += 1
            delay = min(2 ** (backoff_attempt - 1), max_backoff_seconds)
            reconnect_wait_until = time.time() + delay
            logger.info(f"⏳ [EventBus] Redis 재연결 대기: {delay}s (attempt {backoff_attempt})")
            yield None
            continue

        try:
            # Non-blocking message poll with short timeout to avoid stalling SSE heartbeat
            raw = pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
        except Exception as e:
            logger.warning(f"⚠️ [EventBus] get_message() 오류: {e}")
            pubsub = None
            yield None
            continue

        if not raw:
            # no message within timeout window
            yield None
            continue

        msg_type = raw.get("type")
        if msg_type != "message":
            # subscribe/unsubscribe 등은 무시하고 루프 재진입
            yield None
            continue

        try:
            data = json.loads(raw.get("data"))
            # 성공적 수신 -> backoff 리셋
            backoff_attempt = 0
            reconnect_wait_until = None
            yield data
        except Exception:
            logger.exception("❌ [EventBus] Redis 메시지 파싱 실패")
            yield None

    # 연결이 끊어졌는지 간단한 ping으로 주기적 확인 (저비용)
        try:
            if backoff_attempt == 0 and int(time.time()) % 60 == 0:  # roughly every 60s
                _get_redis_client().ping()
        except Exception as e:
            logger.warning(f"⚠️ [EventBus] ping 실패, 재연결 준비: {e}")
            pubsub = None
            continue

        # 만약 pubsub 객체가 None (연결 상실) 이면 재연결 시도 스케줄링
        if pubsub is None:
            if not _connect_pubsub():
                backoff_attempt += 1
                delay = min(2 ** (backoff_attempt - 1), max_backoff_seconds)
                reconnect_wait_until = time.time() + delay
                logger.info(f"⏳ [EventBus] Redis 재연결 예약: {delay}s (attempt {backoff_attempt})")
                yield None


def redis_operator_subscribe_generator(max_backoff_seconds: int = 30):
    """
    운영자 알림 전용 Redis Pub/Sub generator.
    
    OPERATOR_CHANNEL을 구독하여 신고, 기구 고장 등의 알림을 수신합니다.
    """
    backoff_attempt = 0
    reconnect_wait_until: Optional[float] = None
    pubsub = None

    def _connect_pubsub():
        nonlocal pubsub, backoff_attempt, reconnect_wait_until
        try:
            client = _get_redis_client()
            pubsub = client.pubsub(ignore_subscribe_messages=True)
            pubsub.subscribe(OPERATOR_CHANNEL)
            logger.info("🔌 [OperatorNotification] Redis 구독 연결 수립")
            backoff_attempt = 0
            reconnect_wait_until = None
            return True
        except Exception as e:
            logger.warning(f"⚠️ [OperatorNotification] Redis 구독 연결 실패: {e}")
            return False

    # 초기 연결 시도
    _connect_pubsub()

    while True:
        # 재연결 대기 중이면 즉시 None yield
        if reconnect_wait_until and time.time() < reconnect_wait_until:
            yield None
            time.sleep(0.5)
            continue

        if pubsub is None:
            backoff_attempt += 1
            delay = min(2 ** (backoff_attempt - 1), max_backoff_seconds)
            reconnect_wait_until = time.time() + delay
            logger.info(f"⏳ [OperatorNotification] Redis 재연결 대기: {delay}s (attempt {backoff_attempt})")
            yield None
            continue

        try:
            raw = pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
        except Exception as e:
            logger.warning(f"⚠️ [OperatorNotification] get_message() 오류: {e}")
            pubsub = None
            yield None
            continue

        if not raw:
            yield None
            continue

        msg_type = raw.get("type")
        if msg_type != "message":
            yield None
            continue

        try:
            data = json.loads(raw.get("data"))
            backoff_attempt = 0
            reconnect_wait_until = None
            yield data
        except Exception:
            logger.exception("❌ [OperatorNotification] Redis 메시지 파싱 실패")
            yield None

        # 연결 상태 주기적 확인
        try:
            if backoff_attempt == 0 and int(time.time()) % 60 == 0:
                _get_redis_client().ping()
        except Exception as e:
            logger.warning(f"⚠️ [OperatorNotification] ping 실패, 재연결 준비: {e}")
            pubsub = None
            continue

        if pubsub is None:
            if not _connect_pubsub():
                backoff_attempt += 1
                delay = min(2 ** (backoff_attempt - 1), max_backoff_seconds)
                reconnect_wait_until = time.time() + delay
                logger.info(f"⏳ [OperatorNotification] Redis 재연결 예약: {delay}s (attempt {backoff_attempt})")
                yield None
