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
import logging

logger = logging.getLogger(__name__)
logger.info("🔧 [reports/urls.py] URL 패턴 로딩 시작")

router = DefaultRouter()
# 'reports' 경로에 ReportViewSet 등록
router.register(r'reports', ReportViewSet, basename='report')

urlpatterns = [
    # 더 구체적인 경로를 먼저 등록 (중요: router 등록보다 먼저)
    path('daily-stats/by-body-part/', BodyPartDailyStatsView.as_view(), name='body_part_daily_stats'),
    path('daily-stats/', EquipmentDailyStatsView.as_view(), name='equipment_daily_stats'),
    path('utilization/hourly/', HourlyUtilizationView.as_view(), name='hourly_utilization'),
    path('utilization/current/', CurrentUtilizationView.as_view(), name='current_utilization'),
    path('utilization/active-users/', ActiveUtilizationUsersView.as_view(), name='active_utilization_users'),
    # router는 마지막에 (가장 일반적인 경로)
    path('', include(router.urls)),
]

logger.info("✅ [reports/urls.py] URL 패턴 로딩 완료")
logger.info(f"   등록된 패턴: {[p.pattern for p in urlpatterns[:5]]}")