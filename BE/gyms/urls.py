# gyms/urls.py

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import GymViewSet, GymMembershipViewSet

router = DefaultRouter()
# 'gyms' 경로에 GymViewSet을 등록
router.register(r'gyms', GymViewSet)
# 'memberships' 경로에 GymMembershipViewSet을 등록
router.register(r'memberships', GymMembershipViewSet)

urlpatterns = [
    path('', include(router.urls)),
]