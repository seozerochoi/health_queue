from django.shortcuts import render
# workouts/views.py

from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
# workouts/views.py (이 코드로 덮어쓰세요)
from .models import UsageSession, Reservation
from .serializers import UsageSessionSerializer, ReservationSerializer
from .session_management import (
    cancel_active_reservation,
    cleanup_stale_sessions,
    finalize_session,
    notify_equipment_change,
    notify_next_waiter,
)
from equipment.models import Equipment # Equipment 모델 import
from users.models import UserProfile # UserProfile 모델 import
from django.utils import timezone
from django.db import transaction
import datetime
from django.conf import settings
from rest_framework_simplejwt.backends import TokenBackend
from django.contrib.auth import get_user_model
import logging

# "AI 두뇌 사용설명서"에서 예측 함수를 가져옵니다.
# NOTE: Lazy import ai_model to avoid loading heavy ML dependencies at startup
# from ai_model.prediction_utils import get_ai_recommendation
from .utils import get_notification_timeout_minutes, get_waiting_position

logger = logging.getLogger(__name__)


class UsageSessionViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated] # <- 이 줄 추가
    queryset = UsageSession.objects.all()
    serializer_class = UsageSessionSerializer

class ReservationViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated] # <- 이 줄 추가
    queryset = Reservation.objects.all()
    serializer_class = ReservationSerializer

    def get_queryset(self):
        # ⚡ FIXED: 모든 사용자(관리자 포함)는 자신의 예약만 조회 가능 (user_id로 강제 필터)
        # 추가로 Authorization Bearer 토큰을 직접 디코드하여 request.user와 토큰 사용자 불일치 시 토큰 사용자로 교체
        user = self.request.user
        try:
            auth_header = self.request.headers.get('Authorization') or self.request.META.get('HTTP_AUTHORIZATION')
            if auth_header and auth_header.lower().startswith('bearer '):
                raw_token = auth_header.split(' ', 1)[1].strip()
                tb = TokenBackend(
                    algorithm=settings.SIMPLE_JWT.get('ALGORITHM', 'HS256'),
                    signing_key=settings.SIMPLE_JWT.get('SIGNING_KEY', settings.SECRET_KEY),
                )
                payload = tb.decode(raw_token, verify=True)
                token_user_id = payload.get('user_id') or payload.get('user')
                if token_user_id and getattr(user, 'id', None) != token_user_id:
                    User = get_user_model()
                    user = User.objects.get(pk=token_user_id)
                    logger.warning(
                        "⚠️ [ReservationViewSet] request.user와 토큰 사용자 불일치 - request.user=%s token_user_id=%s -> 토큰 사용자로 대체",
                        getattr(self.request.user, 'id', None), token_user_id,
                    )
        except Exception:
            logger.warning("[ReservationViewSet] Authorization 토큰 파싱 실패 - DRF request.user 사용", exc_info=True)
        equipment_id = self.request.query_params.get('equipment_id', None)

        # 🔍 디버깅 로그: 누가 어떤 예약을 조회하는지 확인
        logger.info(
            "🔍 [ReservationViewSet] 조회 요청",
            extra={
                "user_id": getattr(user, "id", None),
                "username": getattr(user, "username", None),
                "staff": getattr(user, "is_staff", None),
                "equipment_id": equipment_id,
            },
        )

        # ⚡ CRITICAL: user 객체가 아닌 user_id로 강제 필터하여 예기치 않은 인증 문제 방지
        qs = (
            Reservation.objects.select_related("equipment", "user")
            .filter(user_id=getattr(user, "id", None))
        )

        # equipment_id 파라미터가 있으면 추가 필터링 (여전히 본인 소유 범위 내)
        if equipment_id:
            qs = qs.filter(equipment_id=equipment_id)

        # 🔍 반환 데이터 샘플 로그 (유출 방지를 위해 최소 정보만)
        sample = list(qs.values_list("user_id", "id", "status")[:10])
        logger.info(
            "📋 [ReservationViewSet] 반환 요약",
            extra={"count": qs.count(), "sample": sample},
        )

        return qs

    def list(self, request, *args, **kwargs):
        """Override list to batch-compute waiting counts and avoid N+1."""
        from django.db.models import Count, Q, Subquery, OuterRef
        
        qs = self.get_queryset()
        
        # ⚡ OPTIMIZATION: Annotate waiting_count per equipment to avoid N+1 in serializer
        # Use subquery to count WAITING/NOTIFIED reservations for each equipment
        waiting_subquery = Reservation.objects.filter(
            equipment_id=OuterRef('equipment_id'),
            status__in=['WAITING', 'NOTIFIED']
        ).values('equipment_id').annotate(cnt=Count('id')).values('cnt')
        
        qs = qs.annotate(waiting_count_cached=Subquery(waiting_subquery))
        
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        user = request.user
        if instance.user != user and not (user.is_staff or user.is_superuser):
            return Response(
                {"detail": "본인 예약만 취소할 수 있습니다."},
                status=status.HTTP_403_FORBIDDEN,
            )

        result = cancel_active_reservation(instance)
        instance.delete()

        return Response(
            {
                "message": "예약이 취소되었습니다.",
                "waiting_count": result.get("waiting_count"),
                "next_notified_reservation_id": result.get("next_reservation_id"),
            },
            status=status.HTTP_200_OK,
        )

class StartSessionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        nfc_tag_id = request.data.get('nfc_tag_id')
        equipment_id = request.data.get('equipment_id')
        user = request.user

        # 🔍 [NFC 디버깅] 수신한 데이터 상세 로깅
        logger.info(f"🔍 [StartSessionView.post] NFC/Equipment 요청")
        logger.info(f"  - nfc_tag_id: '{nfc_tag_id}' (type: {type(nfc_tag_id).__name__})")
        logger.info(f"  - equipment_id: '{equipment_id}' (type: {type(equipment_id).__name__})")
        logger.info(f"  - user: {user.username} (ID: {user.id})")
        
        # NFC 데이터가 있으면 Hex 값으로도 로깅 (숨겨진 문자 감지)
        if nfc_tag_id:
            try:
                hex_value = nfc_tag_id.encode('utf-8').hex()
                logger.info(f"  - nfc_tag_id hex: {hex_value}")
                logger.info(f"  - nfc_tag_id length: {len(nfc_tag_id)}")
            except Exception as e:
                logger.warning(f"  - nfc_tag_id hex 변환 실패: {e}")

        if not nfc_tag_id and not equipment_id:
            return Response({'error': 'nfc_tag_id 또는 equipment_id 중 하나가 필요합니다.'}, status=status.HTTP_400_BAD_REQUEST)

        # 🔍 [NFC 디버깅] DB에 있는 모든 NFC 태그 조회
        try:
            if nfc_tag_id:
                all_nfc_tags = list(Equipment.objects.values_list('nfc_tag_id', flat=True).distinct())
                logger.info(f"📋 [StartSessionView] DB의 모든 nfc_tag_id 목록: {all_nfc_tags}")
                
                # 부분 매칭 확인
                matching_tags = [tag for tag in all_nfc_tags if tag and nfc_tag_id in tag]
                if matching_tags:
                    logger.info(f"  ✓ 부분 매칭 발견: {matching_tags}")
                else:
                    logger.warning(f"  ✗ 부분 매칭 없음")
        except Exception as e:
            logger.error(f"🚨 DB 조회 중 에러: {e}")

        try:
            if equipment_id:
                logger.info(f"🔍 equipment_id로 조회 시도: {equipment_id}")
                equipment = Equipment.objects.get(id=equipment_id)
            else:
                # NFC 태그 ID 정규화: 앞뒤 공백 제거, 대문자로 통일
                normalized_nfc = nfc_tag_id.strip().upper()
                logger.info(f"🔍 nfc_tag_id로 조회 시도")
                logger.info(f"  - 원본: '{nfc_tag_id}'")
                logger.info(f"  - 정규화: '{normalized_nfc}'")
                
                # 대소문자 구분 없이 검색 (iexact)
                equipment = Equipment.objects.get(nfc_tag_id__iexact=normalized_nfc)
            
            logger.info(f"✅ 기구 조회 성공: ID={equipment.id}, Name={equipment.name}, NFC={equipment.nfc_tag_id}")
        except Equipment.DoesNotExist as e:
            logger.error(f"❌ 기구 조회 실패 (DoesNotExist): nfc_tag_id='{nfc_tag_id}', equipment_id='{equipment_id}'")
            return Response({'error': '해당 기구를 찾을 수 없습니다.'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"🚨 기구 조회 중 예상 외 에러: {e}", exc_info=True)
            return Response({'error': f'기구 조회 중 오류: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        with transaction.atomic():
            equipment = Equipment.objects.select_for_update().get(pk=equipment.pk)

            if equipment.status not in ('AVAILABLE', 'WAITING'):
                return Response({'error': '현재 사용할 수 없는 기구입니다.'}, status=status.HTTP_409_CONFLICT)

            existing_session = UsageSession.objects.select_for_update().filter(user=user, end_time__isnull=True).first()
            if existing_session:
                finalize_session(existing_session, now=timezone.now(), reason='user_start_new_session')
                logger.info(
                    "Ended existing session %s for user %s before starting a new one",
                    existing_session.pk,
                    user.username,
                )

            minutes_default = get_notification_timeout_minutes()

            notified_cutoff = timezone.now() - datetime.timedelta(minutes=minutes_default)

            stale_qs = Reservation.objects.select_for_update().filter(
                equipment=equipment,
                status='NOTIFIED',
                notified_at__lt=notified_cutoff,
            )
            promoted_reservation = None
            stale_expired = False
            status_changed = False
            if stale_qs.exists():
                for stale in list(stale_qs):
                    stale.status = 'EXPIRED'
                    stale.save()
                    stale_expired = True

                promoted_reservation = notify_next_waiter(equipment, now=timezone.now())

                queue_exists = Reservation.objects.filter(
                    equipment=equipment,
                    status__in=['WAITING', 'NOTIFIED'],
                ).exists()
                desired_status = 'WAITING' if queue_exists else 'AVAILABLE'
                if equipment.status != 'IN_USE' and equipment.status != desired_status:
                    equipment.status = desired_status
                    equipment.save(update_fields=['status'])  # ⚡ Signal에서 자동 발행
                    status_changed = True

                # ⚡ REMOVED: Signal이 이미 이벤트 발행하므로 중복 호출 제거
                # if (stale_expired or promoted_reservation) and not status_changed:
                #     notify_equipment_change(equipment)

            other_waiting = Reservation.objects.filter(equipment=equipment, status='WAITING').exclude(user=user).exists()
            other_recent_notified = Reservation.objects.filter(equipment=equipment, status='NOTIFIED', notified_at__gte=notified_cutoff).exclude(user=user).exists()
            other_in_queue = other_waiting or other_recent_notified

            # 현재 사용자에게 NOTIFIED 예약이 있는지 확인
            reservation = Reservation.objects.select_for_update().filter(
                equipment=equipment,
                user=user,
                status='NOTIFIED',
                notified_at__gte=notified_cutoff,
            ).first()

            # 다른 대기자가 존재하는데 본인이 NOTIFIED 상태가 아니면 사용 불가
            if other_in_queue and not reservation:
                return Response({'error': '대기열이 있습니다. 알림 받은 사용자만 시작할 수 있습니다.'}, status=status.HTTP_409_CONFLICT)

        allocated_time = 15
        session_type = ''

        if reservation:
            # ✅ 사용 권한 검증 통과: NOTIFIED 사용자. 예약은 queue에서 완전 제거.
            allocated_time = 15
            session_type = 'BASE'
            res_id = reservation.id
            reservation.delete()
            logger.info(f"[StartSession] NOTIFIED 예약 삭제 완료 reservation_id={res_id}")
        else:
            try:
                from ai_model.prediction_utils import get_ai_recommendation

                user_profile = UserProfile.objects.get(user=user)

                now = timezone.now()
                recent_sessions = UsageSession.objects.filter(
                    user=user,
                    start_time__gte=now - datetime.timedelta(hours=24),
                    end_time__isnull=False,
                )

                total_duration_minutes = 0
                upper_duration_minutes = 0
                lower_duration_minutes = 0

                for session in recent_sessions:
                    duration = (session.end_time - session.start_time).total_seconds() / 60
                    total_duration_minutes += duration
                    if session.equipment.body_part == 'UPPER':
                        upper_duration_minutes += duration
                    elif session.equipment.body_part == 'LOWER':
                        lower_duration_minutes += duration

                upper_ratio = (upper_duration_minutes / total_duration_minutes) if total_duration_minutes > 0 else 0
                lower_ratio = (lower_duration_minutes / total_duration_minutes) if total_duration_minutes > 0 else 0

                ratios = {'upper_ratio': upper_ratio, 'lower_ratio': lower_ratio}

                allocated_time = get_ai_recommendation(
                    user_profile,
                    equipment.id, # [FIX] ai_model_id 대신 PK 전달 (prediction_utils에서 PK로 조회함)
                    ratios,
                )
                session_type = 'AI_RECOMMENDED'
            except UserProfile.DoesNotExist:
                logger.warning(
                    "UserProfile missing for %s, falling back to base time",
                    user.username,
                )
                allocated_time = 15
                session_type = 'BASE'
            except Exception as e:
                logger.exception(
                    "AI recommendation failed for user %s equipment %s",
                    user.username,
                    equipment.pk,
                )
                allocated_time = 15
                session_type = 'BASE'

        allocated_time = max(1, int(round(allocated_time)))

        try:
            with transaction.atomic():
                equipment = Equipment.objects.select_for_update().get(pk=equipment.pk)
                if equipment.status != 'AVAILABLE' and not reservation:
                    logger.warning(
                        f"Equipment {equipment.pk} not available at commit time: {equipment.status}"
                    )
                    return Response({'error': '기구가 사용 불가 상태입니다.'}, status=status.HTTP_409_CONFLICT)

                equipment.status = 'IN_USE'
                equipment.save(update_fields=['status'])  # ⚡ Signal에서 자동 발행하므로 notify 호출 불필요
                logger.info(f"✅ [StartSession] Equipment {equipment.id} ({equipment.name}) 상태 변경: IN_USE")

                session = UsageSession.objects.create(
                    user=user,
                    equipment=equipment,
                    allocated_duration_minutes=allocated_time,
                    session_type=session_type,
                    last_heartbeat=timezone.now()
                )
                
                # 📢 운영자 대시보드에 세션 시작 알림 전송 (실시간 통계 반영)
                try:
                    from equipment.event_bus import publish_operator_notification
                    publish_operator_notification('session_started', {
                        'session_id': session.id,
                        'equipment_id': equipment.id,
                        'equipment_name': equipment.name,
                        'gym_id': equipment.gym_id,
                        'user_id': user.id,
                        'username': user.username,
                        'allocated_time': allocated_time,
                    })
                except Exception as e:
                    logger.warning(f"⚠️ [Session] SSE 세션 시작 알림 실패 (무시): {e}")

                # 🔔 큐 상태 반영: 사용 시작 시 본인의 NOTIFIED/WAITING 예약이 소진되므로 대기 인원 업데이트를 즉시 브로드캐스트
                try:
                    from equipment.event_bus import publish_equipment_update
                    waiting_count = Reservation.objects.filter(
                        equipment=equipment,
                        status__in=['WAITING', 'NOTIFIED'],
                    ).count()
                    publish_equipment_update(equipment, waiting_count=waiting_count)
                except Exception:
                    # SSE 발행 실패는 세션 생성 자체를 막지 않음
                    logger.warning("[StartSession] Failed to publish waiting_count update", exc_info=True)
        except Exception as e:
            logger.exception("Failed to create UsageSession or update Equipment status")
            return Response({'error': '서버 에러: 세션 생성 실패'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        serializer = UsageSessionSerializer(session)
        response_data = serializer.data
        try:
            response_data['equipment_status'] = equipment.status
            response_data['equipment_id'] = equipment.id
            response_data['equipment_name'] = equipment.name
        except Exception:
            pass

        return Response(response_data, status=status.HTTP_201_CREATED)
    

class EndSessionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        user = request.user
        try:
            with transaction.atomic():
                current_session = UsageSession.objects.select_for_update().get(user=user, end_time__isnull=True)
                finalize_session(current_session, now=timezone.now(), reason='user_end_session')
                logger.info(
                    "User %s explicitly ended session %s",
                    user.username,
                    current_session.pk,
                )

        except UsageSession.DoesNotExist:
            return Response({'error': '현재 진행 중인 운동 세션이 없습니다.'}, status=status.HTTP_404_NOT_FOUND)

        return Response({'message': '운동이 성공적으로 종료되었습니다.'}, status=status.HTTP_200_OK)


class HeartbeatView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        user = request.user
        try:
            with transaction.atomic():
                session = UsageSession.objects.select_for_update().get(user=user, end_time__isnull=True)
                session.last_heartbeat = timezone.now()
                session.save()
        except UsageSession.DoesNotExist:
            logger.warning("Heartbeat skipped: no active session for user %s", user.username)
            return Response({'message': 'no active session'}, status=status.HTTP_200_OK)

        cleanup_stale_sessions()
        return Response({'message': 'heartbeat recorded'}, status=status.HTTP_200_OK)


class JoinQueueView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        """
        현재 로그인한 사용자를 특정 기구의 대기열에 추가합니다.

        Request body 예:
        { "equipment_id": 3 }

        응답:
        { "reservation_id": 123, "equipment_id": 3, "position": 2, "waiting_count": 5 }
        """
        # DRF의 request.user가 미스매치되는 사례가 있어 토큰을 직접 검증하여 사용자 일치 여부를 강제 확인합니다.
        user = request.user
        try:
            auth_header = request.headers.get('Authorization') or request.META.get('HTTP_AUTHORIZATION')
            if auth_header and auth_header.lower().startswith('bearer '):
                raw_token = auth_header.split(' ', 1)[1].strip()
                tb = TokenBackend(
                    algorithm=settings.SIMPLE_JWT.get('ALGORITHM', 'HS256'),
                    signing_key=settings.SIMPLE_JWT.get('SIGNING_KEY', settings.SECRET_KEY),
                )
                payload = tb.decode(raw_token, verify=True)
                token_user_id = payload.get('user_id') or payload.get('user')
                if token_user_id and getattr(user, 'id', None) != token_user_id:
                    # 토큰의 사용자와 request.user가 다르면 토큰 사용자로 강제 교체
                    User = get_user_model()
                    user = User.objects.get(pk=token_user_id)
                    logger.warning(
                        "⚠️ [JoinQueue] request.user와 토큰 사용자 불일치 - request.user=%s token_user_id=%s -> 토큰 사용자로 대체",
                        getattr(request.user, 'id', None), token_user_id,
                    )
        except Exception:
            # 토큰 파싱 실패는 치명적이지 않음; DRF 인증에 맡김
            logger.warning("[JoinQueue] Authorization 토큰 파싱 실패 - DRF request.user 사용", exc_info=True)
        equipment_id = request.data.get('equipment_id')

        if equipment_id is None:
            return Response({'error': 'equipment_id를 제공해주세요.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            equipment = Equipment.objects.get(id=equipment_id)
        except Equipment.DoesNotExist:
            return Response({'error': '해당 기구가 존재하지 않습니다.'}, status=status.HTTP_404_NOT_FOUND)

        with transaction.atomic():
            equipment = Equipment.objects.select_for_update().get(pk=equipment.pk)

            existing = (
                Reservation.objects.select_for_update()
                .filter(user=user, equipment=equipment, status__in=['WAITING', 'NOTIFIED'])
                .order_by('-created_at')
                .first()
            )

            if existing:
                # 🔁 Idempotent behavior: if user already has an active reservation for this equipment,
                # return current queue info instead of failing. This avoids UX errors on repeated taps.
                waiting_count = Reservation.objects.filter(
                    equipment=equipment,
                    status__in=['WAITING', 'NOTIFIED'],
                ).count()
                position = get_waiting_position(existing) or 1

                logger.info(
                    f"♻️ [JoinQueue] Idempotent return for user {user.username} equipment {equipment.id} - position: {position}"
                )
                return Response(
                    {
                        'reservation_id': existing.id,
                        'equipment_id': equipment.id,
                        'position': position,
                        'waiting_count': waiting_count,
                        'message': '이미 대기 중이거나 알림 상태입니다.',
                    },
                    status=status.HTTP_200_OK,
                )

            reservation = Reservation.objects.create(user=user, equipment=equipment, status='WAITING')
            waiting_count = Reservation.objects.filter(
                equipment=equipment,
                status__in=['WAITING', 'NOTIFIED'],
            ).count()
            position = get_waiting_position(reservation) or 1

            logger.info(f"✅ [JoinQueue] User {user.username} joined queue for Equipment {equipment.id} - position: {position}")
            
            # ⚡ FIX: 줄서기 시 waiting_count가 변경되므로 SSE 이벤트 발행 필요
            from equipment.event_bus import publish_equipment_update
            publish_equipment_update(equipment, waiting_count=waiting_count)

            response_payload = {
                'reservation_id': reservation.id,
                'equipment_id': equipment.id,
                'position': position,
                'waiting_count': waiting_count,
            }
            return Response(response_payload, status=status.HTTP_201_CREATED)


class LeaveQueueView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        """
        사용자가 대기열에서 취소(또는 알림 후 포기)할 때 호출합니다.

        Request body 예: { "reservation_id": 123 }
        또는: { "equipment_id": 3 } (해당 장비에 대해 사용자의 대기/알림 예약을 찾음)
        """
        user = request.user
        reservation_id = request.data.get('reservation_id')
        equipment_id = request.data.get('equipment_id')

        if reservation_id:
            try:
                reservation = Reservation.objects.get(id=reservation_id, user=user)
            except Reservation.DoesNotExist:
                return Response({'error': '해당 예약을 찾을 수 없습니다.'}, status=status.HTTP_404_NOT_FOUND)
        elif equipment_id:
            reservation = (
                Reservation.objects
                .filter(user=user, equipment_id=equipment_id, status__in=['WAITING', 'NOTIFIED'])
                .first()
            )
            if not reservation:
                return Response({'error': '해당 장비에 대한 대기/알림 예약이 없습니다.'}, status=status.HTTP_404_NOT_FOUND)
        else:
            return Response({'error': 'reservation_id 또는 equipment_id를 제공해주세요.'}, status=status.HTTP_400_BAD_REQUEST)

        result = cancel_active_reservation(reservation)
        reservation.delete()

        return Response(
            {
                'message': '대기열에서 탈퇴 처리되었습니다.',
                'waiting_count': result.get('waiting_count'),
                'next_notified_reservation_id': result.get('next_reservation_id'),
            },
            status=status.HTTP_200_OK,
        )


class HeartbeatBeaconView(APIView):
    """비동기 페이지 이탈 상황용: access_token을 쿼리나 body로 전달하여 heartbeat 기록.

    권한: AllowAny (토큰을 직접 디코드). 실패 시 401.
    예상 사용: navigator.sendBeacon('/api/workouts/heartbeat_beacon/?access_token=...&equipment_id=1')
    """
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        token = request.GET.get('access_token') or request.data.get('access_token')
        equipment_id = request.GET.get('equipment_id') or request.data.get('equipment_id')
        if not token:
            return Response({'detail': 'missing token'}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            tb = TokenBackend(algorithm=settings.SIMPLE_JWT.get('ALGORITHM', 'HS256'), signing_key=settings.SIMPLE_JWT.get('SIGNING_KEY', settings.SECRET_KEY))
            payload = tb.decode(token, verify=True)
            user_id = payload.get('user_id') or payload.get('user')
            if not user_id:
                return Response({'detail': 'invalid token payload'}, status=status.HTTP_401_UNAUTHORIZED)
            User = get_user_model()
            user = User.objects.get(pk=user_id)
        except Exception:
            return Response({'detail': 'invalid token'}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            with transaction.atomic():
                session = UsageSession.objects.select_for_update().get(user=user, end_time__isnull=True)
                session.last_heartbeat = timezone.now()
                session.save()
        except UsageSession.DoesNotExist:
            # no active session; benign
            return Response({'message': 'no active session'}, status=status.HTTP_200_OK)

        # 장비 id가 전달되면 간단 검증(선택). 없어도 heartbeat만 갱신.
        return Response({'message': 'heartbeat recorded (beacon)'}, status=status.HTTP_200_OK)


class EndSessionBeaconView(APIView):
    """페이지 종료 직전 best-effort 세션 종료용 비컨 엔드포인트.

    access_token을 쿼리로 받아 세션 종료. 기존 EndSessionView와 동일하나
    인증을 수동 처리하여 sendBeacon 시 Authorization 헤더 한계를 해결.
    """
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        token = request.GET.get('access_token') or request.data.get('access_token')
        if not token:
            return Response({'detail': 'missing token'}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            tb = TokenBackend(algorithm=settings.SIMPLE_JWT.get('ALGORITHM', 'HS256'), signing_key=settings.SIMPLE_JWT.get('SIGNING_KEY', settings.SECRET_KEY))
            payload = tb.decode(token, verify=True)
            user_id = payload.get('user_id') or payload.get('user')
            if not user_id:
                return Response({'detail': 'invalid token payload'}, status=status.HTTP_401_UNAUTHORIZED)
            User = get_user_model()
            user = User.objects.get(pk=user_id)
        except Exception:
            return Response({'detail': 'invalid token'}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            with transaction.atomic():
                current_session = UsageSession.objects.select_for_update().get(user=user, end_time__isnull=True)
                finalize_session(current_session, now=timezone.now(), reason='beacon_end_session')
        except UsageSession.DoesNotExist:
            return Response({'message': 'no active session'}, status=status.HTTP_200_OK)

        return Response({'message': 'session ended (beacon)'}, status=status.HTTP_200_OK)


class UserActivityLogView(APIView):
    """사용자의 운동 기록을 조회하는 API
    
    쿼리 파라미터:
    - start_date: YYYY-MM-DD (선택, 기본: 90일 전)
    - end_date: YYYY-MM-DD (선택, 기본: 오늘)
    - equipment_id: 특정 기구만 필터링 (선택)
    
    응답:
    {
        "activity": {
            "2024-12-09": {  # 날짜별 활동
                "total_sessions": 2,  # 총 운동 세션 수
                "total_minutes": 60,  # 총 운동 시간 (분)
                "equipment": [
                    {
                        "id": 1,
                        "name": "Leg Press",
                        "sessions": [
                            {
                                "session_id": 1,
                                "start_time": "2024-12-09T10:00:00Z",
                                "end_time": "2024-12-09T10:30:00Z",
                                "duration_minutes": 30
                            }
                        ]
                    }
                ]
            }
        },
        "total_sessions": 10,
        "activity_dates": ["2024-12-09", "2024-12-08", ...]  # 활동이 있는 날짜 목록
    }
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from datetime import datetime, timedelta
        
        user = request.user
        
        # 쿼리 파라미터 파싱
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')
        equipment_id = request.query_params.get('equipment_id')
        
        # 기본값: 90일 전부터 오늘까지
        end_date = datetime.now().replace(hour=23, minute=59, second=59).date() if end_date_str is None else datetime.strptime(end_date_str, '%Y-%m-%d').date()
        start_date = (end_date - timedelta(days=90)).replace(day=1) if start_date_str is None else datetime.strptime(start_date_str, '%Y-%m-%d').date()
        
        # 사용자의 운동 세션 조회
        sessions_query = UsageSession.objects.filter(
            user=user,
            end_time__isnull=False,  # 완료된 세션만
            start_time__date__gte=start_date,
            start_time__date__lte=end_date,
        ).select_related('equipment').order_by('-start_time')
        
        # 기구 필터링
        if equipment_id:
            try:
                sessions_query = sessions_query.filter(equipment_id=int(equipment_id))
            except (ValueError, TypeError):
                return Response({'error': 'Invalid equipment_id'}, status=status.HTTP_400_BAD_REQUEST)
        
        sessions = list(sessions_query)
        
        # 날짜별로 그룹화
        activity_dict = {}
        activity_dates = set()
        
        for session in sessions:
            # Django timezone-aware datetime을 현지 시간으로 변환
            session_date = session.start_time.date()
            activity_dates.add(str(session_date))
            
            if str(session_date) not in activity_dict:
                activity_dict[str(session_date)] = {
                    'total_sessions': 0,
                    'total_minutes': 0,
                    'equipment': {}
                }
            
            # 세션 시간 계산
            duration = (session.end_time - session.start_time).total_seconds() / 60
            activity_dict[str(session_date)]['total_sessions'] += 1
            activity_dict[str(session_date)]['total_minutes'] += duration
            
            # 기구별 그룹화
            equip_id = str(session.equipment.id)
            if equip_id not in activity_dict[str(session_date)]['equipment']:
                activity_dict[str(session_date)]['equipment'][equip_id] = {
                    'id': session.equipment.id,
                    'name': session.equipment.name,
                    'category': session.equipment.category if hasattr(session.equipment, 'category') else 'Unknown',
                    'sessions': []
                }
            
            activity_dict[str(session_date)]['equipment'][equip_id]['sessions'].append({
                'session_id': session.id,
                'start_time': session.start_time.isoformat(),
                'end_time': session.end_time.isoformat(),
                'duration_minutes': round(duration, 2),
                'session_type': session.session_type,
            })
        
        # equipment 딕셔너리를 리스트로 변환
        for date_str in activity_dict:
            activity_dict[date_str]['equipment'] = list(activity_dict[date_str]['equipment'].values())
            activity_dict[date_str]['total_minutes'] = round(activity_dict[date_str]['total_minutes'], 2)
        
        return Response({
            'activity': activity_dict,
            'total_sessions': len(sessions),
            'activity_dates': sorted(list(activity_dates), reverse=True),  # 최신 순
        }, status=status.HTTP_200_OK)