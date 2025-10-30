from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAdminUser # 관리자만 접근 가능하도록
from .models import Equipment
from .serializers import EquipmentSerializer

# 기구 목록 조회 API
class EquipmentViewSet(viewsets.ReadOnlyModelViewSet):
    """
    헬스장의 모든 기구 목록과 현재 상태를 보여주는 API 입니다.
    - /equipments/ : 전체 기구 목록
    - /equipments/?gym_id=1 : 특정 헬스장(ID=1)의 기구 목록만 필터링
    """
    queryset = Equipment.objects.all()
    serializer_class = EquipmentSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        # URL 쿼리 파라미터에서 gym_id 값을 가져옵니다.
        gym_id = self.request.query_params.get('gym_id')
        if gym_id:
            queryset = queryset.filter(gym_id=gym_id)
        return queryset
    
    @action(detail=True, methods=['post'], permission_classes=[IsAdminUser])
    def update_status(self, request, pk=None):
        equipment = self.get_object()
        new_status = request.data.get('status')

        # status가 유효한 선택지인지 확인
        if new_status not in Equipment.Status.values:
            return Response({"error": "유효하지 않은 상태 값입니다."}, status=status.HTTP_400_BAD_REQUEST)

        equipment.status = new_status
        equipment.save()
        return Response(EquipmentSerializer(equipment).data)