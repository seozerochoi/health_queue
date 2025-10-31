from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import EquipmentViewSet

# ViewSet은 일반 View와 달리 router를 사용해 URL을 자동으로 생성합니다.
router = DefaultRouter()
router.register(r'equipments', EquipmentViewSet)

urlpatterns = [
    path('', include(router.urls)),
]