# reports/urls.py

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ReportViewSet,
    HourlyUtilizationView,
    CurrentUtilizationView,
    ActiveUtilizationUsersView,
    EquipmentDailyStatsView,
    BodyPartDailyStatsView,
)

router = DefaultRouter()
# 'reports' 경로에 ReportViewSet 등록
router.register(r'reports', ReportViewSet, basename='report')

urlpatterns = [
    path('', include(router.urls)),
    path('utilization/hourly/', HourlyUtilizationView.as_view(), name='hourly_utilization'),
    path('utilization/current/', CurrentUtilizationView.as_view(), name='current_utilization'),
    path('utilization/active-users/', ActiveUtilizationUsersView.as_view(), name='active_utilization_users'),
    path('daily-stats/', EquipmentDailyStatsView.as_view(), name='equipment_daily_stats'),
    path('daily-stats/by-body-part/', BodyPartDailyStatsView.as_view(), name='body_part_daily_stats'),
]