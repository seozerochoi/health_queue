# equipment/urls.py

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import EquipmentViewSet, equipment_stream, operator_notification_stream

router = DefaultRouter()
# 'equipment' 경로에 EquipmentViewSet을 등록합니다.
router.register(r'equipment', EquipmentViewSet, basename='equipment')

urlpatterns = [
    # SSE 스트림은 DRF 라우터보다 먼저 매칭되도록 상단에 배치
    path('equipment/stream/', equipment_stream, name='equipment-stream'),
    path('operator-notifications/', operator_notification_stream, name='operator-notifications'),
    path('', include(router.urls)),
]