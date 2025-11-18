from django.shortcuts import render
# workouts/views.py

from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
# workouts/views.py (이 코드로 덮어쓰세요)
from .models import UsageSession, Reservation
from .serializers import UsageSessionSerializer, ReservationSerializer
from .session_management import cleanup_stale_sessions, finalize_session, notify_equipment_change
from equipment.models import Equipment # Equipment 모델 import
from users.models import UserProfile # UserProfile 모델 import
from django.utils import timezone
from django.conf import settings
from django.db import transaction
import datetime
import logging

# "AI 두뇌 사용설명서"에서 예측 함수를 가져옵니다.
# NOTE: Lazy import ai_model to avoid loading heavy ML dependencies at startup
# from ai_model.prediction_utils import get_ai_recommendation
from .constants import DEFAULT_NOTIFICATION_TIMEOUT_MINUTES

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

            if equipment.status != 'AVAILABLE':
                return Response({'error': '현재 사용할 수 없는 기구입니다.'}, status=status.HTTP_409_CONFLICT)

            existing_session = UsageSession.objects.select_for_update().filter(user=user, end_time__isnull=True).first()
            if existing_session:
                finalize_session(existing_session, now=timezone.now(), reason='user_start_new_session')
                logger.info(
                    "Ended existing session %s for user %s before starting a new one",
                    existing_session.pk,
                    user.username,
                )

            minutes_default = getattr(settings, 'WORKOUT_NOTIFICATION_TIMEOUT_MINUTES', None)
            if minutes_default is None:
                minutes_default = DEFAULT_NOTIFICATION_TIMEOUT_MINUTES
            try:
                minutes_default = float(minutes_default)
            except Exception:
                minutes_default = DEFAULT_NOTIFICATION_TIMEOUT_MINUTES or 0.25

            notified_cutoff = timezone.now() - datetime.timedelta(minutes=minutes_default)

            stale_qs = Reservation.objects.select_for_update().filter(equipment=equipment, status='NOTIFIED', notified_at__lt=notified_cutoff)
            if stale_qs.exists():
                for stale in list(stale_qs):
                    stale.status = 'EXPIRED'
                    stale.save()

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

        # 이미 대기열/알림 상태로 등록되어 있는지 확인
        existing = Reservation.objects.filter(user=user, equipment=equipment, status__in=['WAITING', 'NOTIFIED']).first()
        if existing:
            # 이미 등록되어 있으면 현재 순번을 계산해 반환
            if existing.status == 'NOTIFIED':
                position = 1
            else:
                # 앞에 있는 WAITING 수 + 1
                position = list(Reservation.objects.filter(equipment=equipment, status='WAITING').order_by('created_at')).index(existing) + 1
            waiting_count = Reservation.objects.filter(equipment=equipment, status='WAITING').count()
            return Response({'detail': '이미 대기열에 등록되어 있습니다.', 'reservation_id': existing.id, 'position': position, 'waiting_count': waiting_count}, status=status.HTTP_200_OK)

        # 새 예약(대기) 생성
        reservation = Reservation.objects.create(user=user, equipment=equipment, status='WAITING')

        # 대기 중인 사람 수(생성 후 포함)
        waiting_count = Reservation.objects.filter(equipment=equipment, status='WAITING').count()
        # position은 대기열에서의 순번 (마지막에 추가되었으므로 waiting_count)
        position = waiting_count

        notify_equipment_change(equipment)

        return Response({'reservation_id': reservation.id, 'equipment_id': equipment.id, 'position': position, 'waiting_count': waiting_count}, status=status.HTTP_201_CREATED)


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

        reservation = None
        if reservation_id:
            try:
                reservation = Reservation.objects.get(id=reservation_id, user=user)
            except Reservation.DoesNotExist:
                return Response({'error': '해당 예약을 찾을 수 없습니다.'}, status=status.HTTP_404_NOT_FOUND)
        elif equipment_id:
            reservation = Reservation.objects.filter(user=user, equipment_id=equipment_id, status__in=['WAITING', 'NOTIFIED']).first()
            if not reservation:
                return Response({'error': '해당 장비에 대한 대기/알림 예약이 없습니다.'}, status=status.HTTP_404_NOT_FOUND)
        else:
            return Response({'error': 'reservation_id 또는 equipment_id를 제공해주세요.'}, status=status.HTTP_400_BAD_REQUEST)

        # 예약을 만료시키거나 삭제 처리
        reservation.status = 'EXPIRED'
        reservation.save()

        # 남아 있는 대기자 중 가장 앞사람을 알림 상태로 변경
        equipment = reservation.equipment
        next_reservation = Reservation.objects.filter(equipment=equipment, status='WAITING').order_by('created_at').first()
        if next_reservation:
            next_reservation.status = 'NOTIFIED'
            next_reservation.notified_at = timezone.now()
            next_reservation.save()
            # TODO: FCM 푸시 알림 전송

        waiting_count = Reservation.objects.filter(equipment=equipment, status='WAITING').count()
        notify_equipment_change(equipment)
        return Response({'message': '대기열에서 탈퇴 처리되었습니다.', 'waiting_count': waiting_count}, status=status.HTTP_200_OK)