import logging
logger = logging.getLogger(__name__)
from django.shortcuts import render, get_object_or_404
from django.db import transaction
# equipment/views.py

from rest_framework import viewsets, status
# IsAuthenticated를 import 합니다.
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Equipment
from .serializers import EquipmentSerializer
from users.models import UserProfile
from reports.models import Report
from gyms.models import GymMembership, Gym
# NOTE: Avoid importing Reservation at module level to prevent circular import
# and slow startup. Import inside functions where needed.
# from workouts.models import Reservation

# 추가: SSE(Server-Sent Events) 지원을 위한 임포트
from django.http import StreamingHttpResponse, HttpResponse
import json
import time
from django.conf import settings
from rest_framework_simplejwt.backends import TokenBackend
from django.contrib.auth import get_user_model

from .event_bus import equipment_event_bus


class EquipmentViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    # ⚡ OPTIMIZED: select_related for gym, prefetch for reservations
    queryset = Equipment.objects.all().select_related('gym')
    serializer_class = EquipmentSerializer
    
    def get_queryset(self):
        """Override to add prefetch optimization for list view."""
        qs = super().get_queryset()
        
        # For list view, prefetch reservations to avoid N+1
        if self.action == 'list':
            from workouts.models import Reservation
            qs = qs.prefetch_related(
                'reservation_set'  # Prefetch all reservations
            )
        
        return qs

    def list(self, request, *args, **kwargs):
        """Override list to batch-compute waiting counts to avoid N+1 queries."""
        import time
        start_time = time.time()
        
        from workouts.models import Reservation  # lazy import to avoid circular dependency at module load
        from django.db.models import Count, Q
        
        # CRITICAL OPTIMIZATION: Use annotate to compute waiting_count in a SINGLE query
        # instead of two separate queries (Equipment fetch + Reservation count)
        query_start = time.time()
        qs = self.get_queryset().annotate(
            waiting_count=Count(
                'reservation',
                filter=Q(reservation__status__in=['WAITING', 'NOTIFIED']),
                distinct=True
            )
        )
        
        equips_list = list(qs)  # Force query execution
        query_time = time.time() - query_start
        logger.info(f"⏱️ [Equipment List] DB Query: {query_time:.3f}s, Count: {len(equips_list)}")
        
        serialize_start = time.time()
        serializer = self.get_serializer(equips_list, many=True)
        data = serializer.data
        serialize_time = time.time() - serialize_start
        logger.info(f"⏱️ [Equipment List] Serialization: {serialize_time:.3f}s")
        
        # Attach pre-computed waiting_count to serialized data
        for idx, item in enumerate(data):
            if idx < len(equips_list):
                item['waiting_count'] = equips_list[idx].waiting_count
            else:
                item['waiting_count'] = 0

        total_time = time.time() - start_time
        logger.info(f"⏱️ [Equipment List] Total: {total_time:.3f}s")
        
        return Response(data)

    @action(detail=True, methods=['patch'], url_path='operational-state')
    def set_operational_state(self, request, pk=None):
        """
        운영자 전용: 운영자의 JWT 토큰, gym id, equipment id, 그리고 변경할 상태를 받아
        해당 기구의 운영 상태를 설정합니다.

        상태 변경 로직:
        1. NORMAL → MAINTENANCE: 현재 사용 중인 사용자를 큐 1순위로, 기존 큐는 순번 +1
        2. MAINTENANCE → NORMAL: 큐 1순위 사용자에게 알림 (NOTIFIED 상태로 변경)
        3. ANY → BROKEN: 모든 대기/알림 예약을 EXPIRED 처리

        요청 바디 예시:
        {
            "gym_id": 1,
            "operational_state": "NORMAL"  # 또는 "MAINTENANCE", "BROKEN"
        }
        """
        from workouts.models import Reservation, WorkoutSession
        from django.utils import timezone
        from equipment.event_bus import publish_equipment_update
        
        user = request.user
        # userprofile 존재 및 운영자 권한 확인
        try:
            profile = user.userprofile
        except UserProfile.DoesNotExist:
            return Response({"detail": "유효한 운영자 프로필이 필요합니다."}, status=status.HTTP_403_FORBIDDEN)

        if profile.role != 'OPERATOR':
            return Response({"detail": "운영자 권한이 필요합니다."}, status=status.HTTP_403_FORBIDDEN)

        equipment = self.get_object()

        gym_id = request.data.get('gym_id')
        new_state = request.data.get('operational_state')

        if gym_id is None:
            return Response({"detail": "gym_id를 제공해주세요."}, status=status.HTTP_400_BAD_REQUEST)

        # gym_id가 해당 기구의 gym과 일치하는지 확인
        if str(equipment.gym.id) != str(gym_id) and int(gym_id) != equipment.gym.id:
            return Response({"detail": "제공된 gym_id가 기구의 소속 헬스장과 일치하지 않습니다."}, status=status.HTTP_400_BAD_REQUEST)

        if new_state not in dict(Equipment.OPERATIONAL_STATE_CHOICES).keys():
            return Response({"detail": f"허용되지 않은 상태입니다. 허용값: {list(dict(Equipment.OPERATIONAL_STATE_CHOICES).keys())}"}, status=status.HTTP_400_BAD_REQUEST)

        old_state = equipment.operational_state
        
        # 상태 변경 시 큐 관리 로직
        if old_state != new_state:
            logger.info(f"🔧 [Equipment] operational_state 변경: {equipment.name} ({old_state} → {new_state})")
            
            # CASE 1: NORMAL → MAINTENANCE
            if old_state == 'NORMAL' and new_state == 'MAINTENANCE':
                # 현재 사용 중인 세션 확인
                active_session = WorkoutSession.objects.filter(
                    equipment=equipment,
                    end_time__isnull=True
                ).first()
                
                if active_session:
                    logger.info(f"📍 [Maintenance] 사용 중인 세션 발견: user={active_session.user.username}")
                    # 현재 사용자를 큐 1순위로 이동
                    # 기존 큐의 waiting_position을 +1
                    with transaction.atomic():
                        existing_queue = Reservation.objects.filter(
                            equipment=equipment,
                            status__in=['WAITING', 'NOTIFIED']
                        ).select_for_update().order_by('waiting_position')
                        
                        # 기존 큐 순번 +1
                        for res in existing_queue:
                            res.waiting_position += 1
                            res.save(update_fields=['waiting_position'])
                        
                        # 현재 사용자를 큐 1순위로 추가
                        Reservation.objects.create(
                            user=active_session.user,
                            equipment=equipment,
                            status='WAITING',
                            waiting_position=1,
                            reserved_at=timezone.now()
                        )
                        
                        # 세션 종료
                        active_session.end_time = timezone.now()
                        active_session.save(update_fields=['end_time'])
                        
                        # 기구 상태 변경
                        equipment.status = 'AVAILABLE'
                        equipment.save(update_fields=['status'])
                        
                    logger.info(f"✅ [Maintenance] 사용자를 큐 1순위로 이동 완료")
            
            # CASE 2: MAINTENANCE → NORMAL
            elif old_state == 'MAINTENANCE' and new_state == 'NORMAL':
                # 큐 1순위 사용자를 NOTIFIED로 변경
                first_in_queue = Reservation.objects.filter(
                    equipment=equipment,
                    status__in=['WAITING', 'NOTIFIED']
                ).order_by('waiting_position').first()
                
                if first_in_queue:
                    logger.info(f"🔔 [Normal] 큐 1순위 사용자 알림: user={first_in_queue.user.username}")
                    first_in_queue.status = 'NOTIFIED'
                    first_in_queue.notified_at = timezone.now()
                    first_in_queue.save(update_fields=['status', 'notified_at'])
                    
                    # 기구 상태 업데이트
                    equipment.status = 'WAITING'
                    equipment.save(update_fields=['status'])
                    
                    logger.info(f"✅ [Normal] 큐 1순위 사용자 알림 완료")
            
            # CASE 3: ANY → BROKEN
            elif new_state == 'BROKEN':
                # 모든 대기/알림 예약을 EXPIRED 처리
                expired_count = Reservation.objects.filter(
                    equipment=equipment,
                    status__in=['WAITING', 'NOTIFIED']
                ).update(status='EXPIRED', expired_at=timezone.now())
                
                logger.info(f"❌ [Broken] {expired_count}개의 예약을 EXPIRED 처리")
                
                # 기구 상태를 OUT_OF_ORDER로 변경
                equipment.status = 'OUT_OF_ORDER'
                equipment.save(update_fields=['status'])

        # operational_state 변경
        equipment.operational_state = new_state
        equipment.save(update_fields=['operational_state'])
        
        # SSE 업데이트 발행
        waiting_count = Reservation.objects.filter(
            equipment=equipment,
            status__in=['WAITING', 'NOTIFIED']
        ).count()
        publish_equipment_update(equipment, waiting_count=waiting_count)

        serializer = self.get_serializer(equipment)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='managed')
    def managed_equipments(self, request):
        """
        운영자가 관리하는(소속된) 헬스장의 모든 기구와 각 기구의 운영 상태 및
        불편 신고(대기) 건수를 반환합니다.

        규칙(가정):
        - 운영자가 관리하는 헬스장 = user가 `Gym.owner`인 헬스장 OR
          `GymMembership` 테이블에서 status='APPROVED'로 등록된 헬스장
        - report_count는 현재 상태가 PENDING인 신고 건수로 집계합니다.
        """
        user = request.user
        try:
            profile = user.userprofile
        except UserProfile.DoesNotExist:
            return Response({"detail": "유효한 운영자 프로필이 필요합니다."}, status=status.HTTP_403_FORBIDDEN)

        if profile.role != 'OPERATOR':
            return Response({"detail": "운영자 권한이 필요합니다."}, status=status.HTTP_403_FORBIDDEN)

        # gyms where user is owner
        owner_gyms = Gym.objects.filter(owner=user).values_list('id', flat=True)
        # gyms where user is an approved member (관리자 성격으로 가입한 경우)
        member_gyms = GymMembership.objects.filter(user=user, status='APPROVED').values_list('gym_id', flat=True)

        gym_ids = set(list(owner_gyms) + list(member_gyms))

        equipments = Equipment.objects.filter(gym_id__in=gym_ids)

        results = []
        for eq in equipments:
            pending_reports = Report.objects.filter(equipment=eq, status='PENDING').count()
            results.append({
                'id': eq.id,
                'name': eq.name,
                'gym_id': eq.gym.id,
                'gym_name': eq.gym.name,
                'operational_state': eq.operational_state,
                'report_count': pending_reports,
            })

        return Response(results, status=status.HTTP_200_OK)


def equipment_stream(request):
    """
    Simple SSE endpoint that accepts either session-authenticated requests
    or an `access_token` query parameter (Simple JWT). This view will
    stream an initial snapshot of equipments as an SSE 'initial' event,
    then keep the connection alive by sending heartbeat events.

    NOTE: This is a simple implementation intended to enable the FE to
    open EventSource with a token-in-query. For production push updates
    you should integrate with Django Channels, Redis pub/sub or another
    async push mechanism to send updates when equipments change.
    """
    # Authenticate by token-in-query OR session/cookie
    token = request.GET.get('access_token')
    user = None
    if token:
        try:
            tb = TokenBackend(algorithm=settings.SIMPLE_JWT.get('ALGORITHM', 'HS256'), signing_key=settings.SIMPLE_JWT.get('SIGNING_KEY', settings.SECRET_KEY))
            payload = tb.decode(token, verify=True)
            user_id = payload.get('user_id') or payload.get('user')
            if not user_id:
                return HttpResponse(status=401)
            User = get_user_model()
            try:
                user = User.objects.get(pk=user_id)
            except User.DoesNotExist:
                return HttpResponse(status=401)
        except Exception as e:
            return HttpResponse(status=401)
    else:
        # Fall back to Django authentication (session/cookie)
        if request.user and request.user.is_authenticated:
            user = request.user
        else:
            return HttpResponse(status=401)

    def event_stream():
        from workouts.models import Reservation  # lazy import
        from django.db.models import Count, Q

        equipments = Equipment.objects.all().annotate(
            waiting_count=Count(
                'reservation',
                filter=Q(reservation__status__in=['WAITING', 'NOTIFIED']),
                distinct=True
            )
        )

        serialized = []
        for eq in equipments:
            serialized.append({
                'id': str(eq.id),
                'name': eq.name,
                'type': getattr(eq, 'type', None),
                'status': getattr(eq, 'status', None),
                'image_url': getattr(eq, 'image_url', '') or getattr(eq, 'image', ''),
                'base_session_time_minutes': getattr(eq, 'base_session_time_minutes', None),
                'waiting_count': eq.waiting_count,
            })

        yield f"event: initial\ndata: {json.dumps(serialized)}\n\n"
        # 최초 연결 직후 heartbeat도 바로 전송
        yield "event: heartbeat\ndata: {}\n\n"

        last_state = {item['id']: item for item in serialized}
        heartbeat = getattr(settings, 'EQUIPMENT_SSE_HEARTBEAT_SECONDS', 10)  # 10초로 단축
        iteration_count = 0

        logger.info(f"🚀 [SSE] Event stream started - heartbeat: {heartbeat}s")

        from equipment.event_bus import redis_subscribe_generator, REDIS_CHANNEL
        import time
        redis_gen = redis_subscribe_generator()
        last_activity = time.time()
        try:
            while True:
                iteration_count += 1
                try:
                    # ⚡ CRITICAL: Process ONLY Redis events for consistency across all workers
                    # Local buffer removed to prevent race conditions and state inconsistencies
                    
                    # Redis cross-worker 이벤트 처리 (모든 워커가 동일한 이벤트 스트림 수신)
                    got_redis = False
                    # consume up to 5 messages per loop to avoid backlog while keeping heartbeat cadence
                    for _ in range(5):
                        msg = next(redis_gen)
                        if not msg:
                            break
                        payload = msg.get('payload', {})
                        eq_id = payload.get('id')
                        if eq_id:
                            last_state[eq_id] = payload
                        evt_type = msg.get('type', 'update')
                        yield f"event: {evt_type}\ndata: {json.dumps(payload)}\n\n"
                        last_activity = time.time()
                        got_redis = True

                    # 주기적 상태 로그
                    if iteration_count % 12 == 0:  # 약 120초 간격
                        logger.info(f"⏰ [SSE] alive iter={iteration_count} last_activity={int(time.time()-last_activity)}s")

                    # 최근 활동 없으면 heartbeat
                    if time.time() - last_activity >= heartbeat:
                        yield "event: heartbeat\ndata: {}\n\n"
                        last_activity = time.time()
                    elif not got_redis:
                        # prevent busy-spin when idle
                        time.sleep(0.05)
                except StopIteration:
                    # Redis generator ended unexpectedly -> recreate
                    logger.warning("⚠️ [SSE] Redis generator ended; recreating")
                    redis_gen = redis_subscribe_generator()
                    yield "event: heartbeat\ndata: {}\n\n"
                except Exception:
                    logger.exception("❌ [SSE] loop error; sending heartbeat")
                    yield "event: heartbeat\ndata: {}\n\n"
        except GeneratorExit:
            # client disconnected
            logger.info(f"🔌 [SSE] 클라이언트 연결 종료 (GeneratorExit) - iterations: {iteration_count}")
            return
        except Exception as e:
            logger.exception(f"❌ [SSE] event_stream outer error - iterations: {iteration_count}")
            return

    response = StreamingHttpResponse(event_stream(), content_type='text/event-stream')
    response['Cache-Control'] = 'no-cache'
    response['X-Accel-Buffering'] = 'no'  # nginx 버퍼링 비활성화
    response['Connection'] = 'keep-alive'
    return response