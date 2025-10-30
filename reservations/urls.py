from django.urls import path
from .views import EquipmentInteractionAPIView, ExtendUsageTimeAPIView

urlpatterns = [
    path('equipment/<int:equipment_id>/interact/', EquipmentInteractionAPIView.as_view(), name='equipment-interact'),
    
    # 👇 "POST /api/reservations/extend/" 주소로 요청이 오면 ExtendUsageTimeAPIView를 실행
    path('extend/', ExtendUsageTimeAPIView.as_view(), name='extend-usage'),
]