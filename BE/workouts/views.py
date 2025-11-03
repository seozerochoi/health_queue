from django.shortcuts import render
# workouts/views.py

from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
# workouts/views.py (이 코드로 덮어쓰세요)
from .models import UsageSession, Reservation
from .serializers import UsageSessionSerializer, ReservationSerializer
from equipment.models import Equipment # Equipment 모델 import
from users.models import UserProfile # UserProfile 모델 import
from django.utils import timezone
import datetime

# "AI 두뇌 사용설명서"에서 예측 함수를 가져옵니다.
from ai_model.prediction_utils import get_ai_recommendation

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

        if equipment.status != 'AVAILABLE':
            return Response({'error': '현재 사용할 수 없는 기구입니다.'}, status=status.HTTP_409_CONFLICT)
        
        if UsageSession.objects.filter(user=user, end_time__isnull=True).exists():
            return Response({'error': '이미 다른 기구를 사용 중입니다.'}, status=status.HTTP_409_CONFLICT)

        allocated_time = 0
        session_type = ''

        reservation = Reservation.objects.filter(
            equipment=equipment, 
            user=user,
            status='NOTIFIED'
        ).first()

        if reservation:
            # 예약자일 경우: 고정 시간 할당 (변경 없음)
            allocated_time = equipment.base_session_time_minutes
            session_type = 'BASE'
            reservation.status = 'COMPLETED'
            reservation.save()
        else:
            # --- AI 추천 로직 시작 ---
            # 예약자가 아닐 경우 (비어있는 기구 사용)
            try:
                user_profile = UserProfile.objects.get(user=user)
                
                # 1. 최근 24시간 운동 기록을 DB에서 조회
                now = timezone.now()
                recent_sessions = UsageSession.objects.filter(
                    user=user, 
                    start_time__gte=now - datetime.timedelta(hours=24),
                    end_time__isnull=False # 완료된 세션만
                )

                # 2. 상/하체 운동 비율 계산
                total_duration_minutes = 0
                upper_duration_minutes = 0
                lower_duration_minutes = 0
                
                for session in recent_sessions:
                    # 운동 시간을 분 단위로 계산
                    duration = (session.end_time - session.start_time).total_seconds() / 60
                    total_duration_minutes += duration
                    
                    # equipment/models.py에 추가한 body_part 필드 사용
                    if session.equipment.body_part == 'UPPER':
                        upper_duration_minutes += duration
                    elif session.equipment.body_part == 'LOWER':
                        lower_duration_minutes += duration
                
                # 3. 비율(ratio) 계산 (0으로 나누기 방지)
                upper_ratio = (upper_duration_minutes / total_duration_minutes) if total_duration_minutes > 0 else 0
                lower_ratio = (lower_duration_minutes / total_duration_minutes) if total_duration_minutes > 0 else 0
                
                ratios = {'upper_ratio': upper_ratio, 'lower_ratio': lower_ratio}
                
                print(f"DB 기반 비율 계산: 상체 {upper_ratio:.2f}, 하체 {lower_ratio:.2f}")

                # 4. AI 모델 호출
                allocated_time = get_ai_recommendation(
                    user_profile,
                    equipment.ai_model_id, # DB에 저장된 AI용 기구 ID 전달
                    ratios
                )
                session_type = 'AI_RECOMMENDED'

            except UserProfile.DoesNotExist:
                # 유저 프로필이 없는 경우
                allocated_time = equipment.base_session_time_minutes
                session_type = 'BASE'
            except Exception as e:
                # 기타 AI 예측 오류 발생 시
                print(f"!!! AI 추천 중 오류 발생: {e}")
                allocated_time = equipment.base_session_time_minutes # 오류 시 기본 시간
                session_type = 'BASE'
            # --- AI 추천 로직 끝 ---

        # 5. 새로운 운동 세션 생성
        equipment.status = 'IN_USE'
        equipment.save()

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