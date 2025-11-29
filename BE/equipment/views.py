import logging
logger = logging.getLogger(__name__)
from django.shortcuts import render, get_object_or_404
from django.db import transaction
from django.views.decorators.csrf import csrf_exempt
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
        
        # SSE 업데이트 발행 (operational_state 변경 포함)
        waiting_count = Reservation.objects.filter(
            equipment=equipment,
            status__in=['WAITING', 'NOTIFIED']
        ).count()
        
        # operational_state 정보를 extra 필드로 추가
        extra = {
            'operational_state': new_state,
            'operational_state_display': equipment.get_operational_state_display(),
            'previous_state': old_state,
        }
        publish_equipment_update(equipment, waiting_count=waiting_count, extra=extra)
        logger.info(f"📡 [SSE] operational_state 변경 이벤트 발행: {equipment.name} ({old_state} → {new_state})")

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

    def create(self, request, *args, **kwargs):
        """
        운영자만 기구를 추가할 수 있는 API (POST /api/equipment/)
        필수 정보 누락 시 명확한 에러 메시지 반환
        gym, nfc_tag_id는 서버에서 자동 할당, 이미지는 업로드 지원
        """
        user = request.user
        try:
            profile = user.userprofile
        except Exception:
            return Response({"detail": "운영자 프로필이 필요합니다."}, status=status.HTTP_403_FORBIDDEN)
        if profile.role != 'OPERATOR':
            return Response({"detail": "운영자 권한이 필요합니다."}, status=status.HTTP_403_FORBIDDEN)

        required_fields = [
            'name', 'type', 'difficulty'
        ]
        missing = [f for f in required_fields if not request.data.get(f)]
        if missing:
            return Response({
                "detail": f"필수 정보가 누락되었습니다: {', '.join(missing)}",
                "required_fields": required_fields
            }, status=status.HTTP_400_BAD_REQUEST)

        # gym 자동 할당: 운영자가 관리하는 첫 번째 gym
        owner_gyms = Gym.objects.filter(owner=user)
        if not owner_gyms.exists():
            return Response({"detail": "운영자 소유 gym이 없습니다. 먼저 gym을 등록하세요."}, status=status.HTTP_400_BAD_REQUEST)
        gym = owner_gyms.first()

        # nfc_tag_id 자동 생성 (예: 'NFC' + 0-padded id)
        last_id = Equipment.objects.order_by('-id').first()
        next_id = (last_id.id + 1) if last_id else 1
        nfc_tag_id = f"NFC{str(next_id).zfill(3)}"
        arduino_id = f"ARD{str(next_id).zfill(3)}"

        # 이미지 업로드 지원 (multipart/form-data)
        data = request.data.copy()
        data['nfc_tag_id'] = nfc_tag_id
        data['arduino_id'] = arduino_id
        if 'image' in request.FILES:
            data['image'] = request.FILES['image']
        
        # serializer는 gym을 ReadOnlyField로 설정했으므로 직접 생성해야 함
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        
        # gym을 직접 할당하여 저장
        equipment = serializer.save(gym=gym)
        # gym을 직접 할당하여 저장
        equipment = serializer.save(gym=gym)
        
        # 기구 생성 후 SSE 브로드캐스트 (사용자들에게)
        try:
            from equipment.event_bus import publish_equipment_update
            publish_equipment_update(equipment)
            logger.info(f"📡 [Equipment] 기구 생성 SSE 브로드캐스트: equipment_id={equipment.id}, name={equipment.name}")
        except Exception as e:
            logger.exception(f"❌ [Equipment] 기구 SSE 브로드캐스트 실패: {e}")
        
        # 기구 생성 후 운영자 알림 전송
        try:
            from equipment.event_bus import publish_operator_notification
            
            payload = {
                'equipment_id': equipment.id,
                'equipment_name': equipment.name,
                'equipment_type': equipment.type,
                'gym_id': equipment.gym.id,
                'gym_name': equipment.gym.name,
                'created_by': user.username,
            }
            
            publish_operator_notification('equipment_created', payload)
            logger.info(f"📢 [Equipment] 기구 생성 알림 발송: equipment_id={equipment.id}, name={equipment.name}")
        except Exception as e:
            logger.exception(f"❌ [Equipment] 기구 생성 알림 발송 실패: {e}")
            # 알림 실패해도 기구는 정상 생성
        
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)
    
    @action(detail=False, methods=['get'], url_path='daily-stats')
    def daily_stats(self, request):
        """
        운영자 전용: 오늘 날짜의 기구별 이용 통계 조회
        
        Response:
        [
            {
                "equipment_id": 1,
                "equipment_name": "벤치프레스",
                "usage_count": 32,
                "average_time_minutes": 22.5
            },
            ...
        ]
        """
        from django.utils import timezone
        from .daily_stats_models import EquipmentDailyStats
        
        user = request.user
        try:
            profile = user.userprofile
        except Exception:
            return Response({"detail": "운영자 프로필이 필요합니다."}, status=status.HTTP_403_FORBIDDEN)
        
        if profile.role != 'OPERATOR':
            return Response({"detail": "운영자 권한이 필요합니다."}, status=status.HTTP_403_FORBIDDEN)
        
        # 운영자가 관리하는 gym의 기구들만 조회
        from gyms.models import Gym
        owner_gyms = Gym.objects.filter(owner=user)
        if not owner_gyms.exists():
            return Response({"detail": "운영자 소유 gym이 없습니다."}, status=status.HTTP_400_BAD_REQUEST)
        
        gym = owner_gyms.first()
        today = timezone.now().date()
        
        # 해당 gym의 모든 기구 가져오기
        equipments = Equipment.objects.filter(gym=gym).order_by('name')
        
        result = []
        for equipment in equipments:
            # 오늘 통계 가져오기 (없으면 0으로 초기화)
            try:
                stats = EquipmentDailyStats.objects.get(equipment=equipment, date=today)
                usage_count = stats.usage_count
                average_time = round(stats.average_time_minutes, 1)
            except EquipmentDailyStats.DoesNotExist:
                usage_count = 0
                average_time = 0.0
            
            result.append({
                'equipment_id': equipment.id,
                'equipment_name': equipment.name,
                'usage_count': usage_count,
                'average_time_minutes': average_time,
            })
        
        return Response(result, status=status.HTTP_200_OK)

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
        from django.db import connection

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
                'operational_state': getattr(eq, 'operational_state', None),
                'image_url': getattr(eq, 'image_url', '') or getattr(eq, 'image', ''),
                'base_session_time_minutes': getattr(eq, 'base_session_time_minutes', None),
                'waiting_count': eq.waiting_count,
            })

        # ✅ 초기 스냅샷 전송 후 DB 연결 정리 (SSE는 이후 Redis만 사용)
        connection.close()
        
        # ✅ 초기 스냅샷 전송 후 DB 연결 정리 (SSE는 이후 Redis만 사용)
        connection.close()
        
        yield f"event: initial\ndata: {json.dumps(serialized)}\n\n"
        # 최초 연결 직후 heartbeat도 바로 전송
        yield "event: heartbeat\ndata: {}\n\n"

        # ⚡ REMOVED: last_state는 메모리만 차지하고 실제로 사용되지 않음
        # Redis가 모든 상태 변경을 전달하므로 로컬 캐시 불필요
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
                        # ⚡ REMOVED: last_state 캐싱 불필요 (Redis가 모든 상태 관리)
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


@csrf_exempt
def operator_notification_stream(request):
    """
    운영자 전용 SSE 엔드포인트. 신고, 기구 고장 등의 알림을 실시간으로 전송합니다.
    
    인증: JWT 토큰 (query parameter의 access_token) 또는 세션
    권한: 운영자(OPERATOR) 권한 필요
    """
    # 인증 처리
    token = request.GET.get('access_token')
    user = None
    if token:
        try:
            tb = TokenBackend(algorithm=settings.SIMPLE_JWT.get('ALGORITHM', 'HS256'), 
                            signing_key=settings.SIMPLE_JWT.get('SIGNING_KEY', settings.SECRET_KEY))
            payload = tb.decode(token, verify=True)
            user_id = payload.get('user_id') or payload.get('user')
            if not user_id:
                return HttpResponse(status=401)
            User = get_user_model()
            try:
                user = User.objects.get(pk=user_id)
            except User.DoesNotExist:
                return HttpResponse(status=401)
        except Exception:
            return HttpResponse(status=401)
    else:
        if request.user and request.user.is_authenticated:
            user = request.user
        else:
            return HttpResponse(status=401)
    
    # 운영자 권한 확인
    try:
        profile = user.userprofile
        if profile.role != 'OPERATOR':
            return HttpResponse("Operator role required", status=403)
    except Exception:
        return HttpResponse("Operator profile required", status=403)
    
    def event_stream():
        from django.db import connection
        
        # 초기 연결 성공 메시지
        yield "event: connected\ndata: {\"message\": \"Operator notification stream connected\"}\n\n"
        yield "event: heartbeat\ndata: {}\n\n"
        
        # ✅ 초기 메시지 전송 후 DB 연결 정리 (이후 Redis만 사용)
        connection.close()
        
        heartbeat = getattr(settings, 'OPERATOR_SSE_HEARTBEAT_SECONDS', 15)
        iteration_count = 0
        
        logger.info(f"🚀 [OperatorSSE] Notification stream started for user={user.username} - heartbeat: {heartbeat}s")
        
        from equipment.event_bus import redis_operator_subscribe_generator
        import time
        
        redis_gen = redis_operator_subscribe_generator()
        last_activity = time.time()
        
        try:
            while True:
                iteration_count += 1
                try:
                    # Redis 운영자 알림 채널에서 메시지 수신
                    got_message = False
                    for _ in range(5):  # 최대 5개 메시지 처리
                        msg = next(redis_gen)
                        if not msg:
                            break
                        
                        event_type = msg.get('type', 'notification')
                        payload = msg.get('payload', {})
                        
                        # gym_id 필터링 (운영자가 관리하는 gym만)
                        gym_id = payload.get('gym_id')
                        if gym_id:
                            # 운영자가 해당 gym을 관리하는지 확인
                            owner_gyms = Gym.objects.filter(owner=user).values_list('id', flat=True)
                            member_gyms = GymMembership.objects.filter(user=user, status='APPROVED').values_list('gym_id', flat=True)
                            managed_gym_ids = set(list(owner_gyms) + list(member_gyms))
                            
                            if gym_id not in managed_gym_ids:
                                # 이 운영자가 관리하지 않는 gym의 알림은 스킵
                                continue
                        
                        yield f"event: {event_type}\ndata: {json.dumps(payload)}\n\n"
                        last_activity = time.time()
                        got_message = True
                        
                        logger.debug(f"📨 [OperatorSSE] Sent {event_type} to user={user.username}")
                    
                    # 주기적 상태 로그
                    if iteration_count % 12 == 0:
                        logger.info(f"⏰ [OperatorSSE] alive iter={iteration_count} user={user.username} last_activity={int(time.time()-last_activity)}s")
                    
                    # heartbeat 전송
                    if time.time() - last_activity >= heartbeat:
                        yield "event: heartbeat\ndata: {}\n\n"
                        last_activity = time.time()
                    elif not got_message:
                        time.sleep(0.05)
                        
                except StopIteration:
                    logger.warning("⚠️ [OperatorSSE] Redis generator ended; recreating")
                    redis_gen = redis_operator_subscribe_generator()
                    yield "event: heartbeat\ndata: {}\n\n"
                except Exception:
                    logger.exception("❌ [OperatorSSE] loop error; sending heartbeat")
                    yield "event: heartbeat\ndata: {}\n\n"
                    
        except GeneratorExit:
            logger.info(f"🔌 [OperatorSSE] 클라이언트 연결 종료 user={user.username} - iterations: {iteration_count}")
            return
        except Exception:
            logger.exception(f"❌ [OperatorSSE] event_stream error user={user.username} - iterations: {iteration_count}")
            return
    
    response = StreamingHttpResponse(event_stream(), content_type='text/event-stream')
    response['Cache-Control'] = 'no-cache'
    response['X-Accel-Buffering'] = 'no'
    response['Connection'] = 'keep-alive'
    return response