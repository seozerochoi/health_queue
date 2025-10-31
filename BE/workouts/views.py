from django.shortcuts import render
# workouts/views.py

from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import UsageSession, Reservation, Equipment
from .serializers import UsageSessionSerializer, ReservationSerializer
from django.utils import timezone
import datetime

class UsageSessionViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated] # <- 이 줄 추가
    queryset = UsageSession.objects.all()
    serializer_class = UsageSessionSerializer

class ReservationViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated] # <- 이 줄 추가
    queryset = Reservation.objects.all()
    serializer_class = ReservationSerializer

class StartSessionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        nfc_tag_id = request.data.get('nfc_tag_id')
        user = request.user

        if not nfc_tag_id:
            return Response({'error': 'NFC 태그 ID가 필요합니다.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            equipment = Equipment.objects.get(nfc_tag_id=nfc_tag_id)
        except Equipment.DoesNotExist:
            return Response({'error': '해당 NFC 태그를 가진 기구가 없습니다.'}, status=status.HTTP_404_NOT_FOUND)

        # 1. 기구가 이미 사용 중이거나 고장 상태인지 확인
        if equipment.status != 'AVAILABLE':
            return Response({'error': '현재 사용할 수 없는 기구입니다.'}, status=status.HTTP_409_CONFLICT)
        
        # 2. 다른 기구를 이미 사용 중인지 확인 (한 번에 하나만 사용 가능)
        if UsageSession.objects.filter(user=user, end_time__isnull=True).exists():
            return Response({'error': '이미 다른 기구를 사용 중입니다.'}, status=status.HTTP_409_CONFLICT)

        allocated_time = 0
        session_type = ''

        # 3. 예약자인지 확인
        reservation = Reservation.objects.filter(
            equipment=equipment, 
            user=user,
            status='NOTIFIED' # 내 차례라고 알림을 받은 예약자
        ).first()

        if reservation:
            # 예약자일 경우: 고정 시간 할당
            allocated_time = equipment.base_session_time_minutes
            session_type = 'BASE'
            reservation.status = 'COMPLETED'
            reservation.save()
        else:
            # 예약자가 아닐 경우 (비어있는 기구 사용)
            # TODO: AI 모델을 호출하여 추천 시간을 받아오는 로직 추가
            # 지금은 임시로 기본 시간에 5분을 더한 값을 할당
            allocated_time = equipment.base_session_time_minutes + 5 
            session_type = 'AI_RECOMMENDED'

        # 4. 기구 상태를 '사용 중'으로 변경
        equipment.status = 'IN_USE'
        equipment.save()

        # 5. 새로운 운동 세션 생성
        session = UsageSession.objects.create(
            user=user,
            equipment=equipment,
            allocated_duration_minutes=allocated_time,
            session_type=session_type
        )

        # TODO: 아두이노에 소켓 통신으로 'UNLOCK' 신호 보내는 로직 추가

        serializer = UsageSessionSerializer(session)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    

class EndSessionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        user = request.user

        # 1. 현재 진행 중인 운동 세션을 찾습니다.
        try:
            current_session = UsageSession.objects.get(user=user, end_time__isnull=True)
        except UsageSession.DoesNotExist:
            return Response({'error': '현재 진행 중인 운동 세션이 없습니다.'}, status=status.HTTP_404_NOT_FOUND)

        # 2. 세션 종료 시간 기록 및 기구 상태 변경
        current_session.end_time = timezone.now()
        current_session.save()

        equipment = current_session.equipment
        equipment.status = 'AVAILABLE'
        equipment.save()

        # TODO: 아두이노에 소켓 통신으로 'LOCK' 신호 보내는 로직 추가

        # 3. 다음 대기자에게 알림 보내기
        next_reservation = Reservation.objects.filter(equipment=equipment, status='WAITING').order_by('created_at').first()
        if next_reservation:
            next_reservation.status = 'NOTIFIED'
            next_reservation.notified_at = timezone.now()
            next_reservation.save()
            # TODO: 다음 사용자에게 FCM 푸시 알림을 보내는 로직 추가

        return Response({'message': '운동이 성공적으로 종료되었습니다.'}, status=status.HTTP_200_OK)