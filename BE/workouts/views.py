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
        # Admin/staff can view all reservations; regular users only their own.
        user = self.request.user
        if user.is_staff or user.is_superuser:
            return Reservation.objects.all()
        return Reservation.objects.filter(user=user)

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

        if not nfc_tag_id and not equipment_id:
            return Response({'error': 'nfc_tag_id 또는 equipment_id 중 하나가 필요합니다.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            if equipment_id:
                equipment = Equipment.objects.get(id=equipment_id)
            else:
                equipment = Equipment.objects.get(nfc_tag_id=nfc_tag_id)
        except Equipment.DoesNotExist:
            return Response({'error': '해당 기구를 찾을 수 없습니다.'}, status=status.HTTP_404_NOT_FOUND)

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
                    equipment.save()
                    status_changed = True

                if stale_expired or promoted_reservation or status_changed:
                    notify_equipment_change(equipment)

            other_waiting = Reservation.objects.filter(equipment=equipment, status='WAITING').exclude(user=user).exists()
            other_recent_notified = Reservation.objects.filter(equipment=equipment, status='NOTIFIED', notified_at__gte=notified_cutoff).exclude(user=user).exists()
            other_in_queue = other_waiting or other_recent_notified

            reservation = Reservation.objects.select_for_update().filter(equipment=equipment, user=user, status='NOTIFIED', notified_at__gte=notified_cutoff).first()
            if other_in_queue and not reservation:
                return Response({'error': '대기열이 있습니다. 알림 받은 사용자만 시작할 수 있습니다.'}, status=status.HTTP_409_CONFLICT)

        allocated_time = equipment.base_session_time_minutes
        session_type = ''

        if reservation:
            allocated_time = equipment.base_session_time_minutes
            session_type = 'BASE'
            reservation.status = 'COMPLETED'
            reservation.save()
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
                    equipment.ai_model_id,
                    ratios,
                )
                session_type = 'AI_RECOMMENDED'
            except UserProfile.DoesNotExist:
                logger.warning(
                    "UserProfile missing for %s, falling back to base time",
                    user.username,
                )
                allocated_time = equipment.base_session_time_minutes
                session_type = 'BASE'
            except Exception as e:
                logger.exception(
                    "AI recommendation failed for user %s equipment %s",
                    user.username,
                    equipment.pk,
                )
                allocated_time = equipment.base_session_time_minutes
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
                equipment.save()
                notify_equipment_change(equipment)

                session = UsageSession.objects.create(
                    user=user,
                    equipment=equipment,
                    allocated_duration_minutes=allocated_time,
                    session_type=session_type,
                    last_heartbeat=timezone.now()
                )
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
        user = request.user
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
                return Response(
                    {"error": "이미 예약한 장비입니다."},
                    status=status.HTTP_409_CONFLICT,
                )

            reservation = Reservation.objects.create(user=user, equipment=equipment, status='WAITING')
            waiting_count = Reservation.objects.filter(
                equipment=equipment,
                status__in=['WAITING', 'NOTIFIED'],
            ).count()
            position = get_waiting_position(reservation) or 1

            notify_equipment_change(equipment)

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