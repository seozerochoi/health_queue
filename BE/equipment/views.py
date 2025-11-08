from django.shortcuts import render
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


class EquipmentViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Equipment.objects.all()
    serializer_class = EquipmentSerializer

    @action(detail=True, methods=['patch'], url_path='operational-state')
    def set_operational_state(self, request, pk=None):
        """
        운영자 전용: 운영자의 JWT 토큰, gym id, equipment id, 그리고 변경할 상태를 받아
        해당 기구의 운영 상태를 설정합니다.

        요청 바디 예시:
        {
            "gym_id": 1,
            "operational_state": "NORMAL"  # 또는 "MAINTENANCE"
        }
        """
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

        equipment.operational_state = new_state
        equipment.save()

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