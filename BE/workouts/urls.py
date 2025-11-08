# workouts/urls.py

from django.urls import path, include
from rest_framework.routers import DefaultRouter
# StartSessionView를 import 합니다.
from .views import UsageSessionViewSet, ReservationViewSet, StartSessionView, EndSessionView, JoinQueueView, LeaveQueueView
from .views import JoinQueueView

router = DefaultRouter()
router.register(r'sessions', UsageSessionViewSet, basename='usagesession')
router.register(r'reservations', ReservationViewSet, basename='reservation')

urlpatterns = [
    # '/api/workouts/start/' 주소를 추가합니다.
    path('workouts/start/', StartSessionView.as_view(), name='start-session'),
    path('workouts/end/', EndSessionView.as_view(), name='end-session'),
    path('workouts/join-queue/', JoinQueueView.as_view(), name='join-queue'),
    path('workouts/leave-queue/', LeaveQueueView.as_view(), name='leave-queue'),
    # 기존 router.urls는 그대로 둡니다.
    path('', include(router.urls)),
]