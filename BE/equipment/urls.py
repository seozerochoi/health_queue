# equipment/urls.py

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import EquipmentViewSet, equipment_stream

router = DefaultRouter()
# 'equipment' 경로에 EquipmentViewSet을 등록합니다.
router.register(r'equipment', EquipmentViewSet, basename='equipment')

urlpatterns = [
    path('equipment/stream/', equipment_stream, name='equipment-stream'),
    path('', include(router.urls)),
]