from django.shortcuts import render
# reports/views.py

from rest_framework import viewsets
# IsAuthenticated를 import 합니다.
from rest_framework.permissions import IsAuthenticated
from .models import Report
from .serializers import ReportSerializer
import logging

logger = logging.getLogger(__name__)


class ReportViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated] # <- 이 줄 추가
    queryset = Report.objects.all()
    serializer_class = ReportSerializer
    
    def perform_create(self, serializer):
        # 신고를 생성할 때 자동으로 reporter를 현재 로그인한 사용자로 설정
        report = serializer.save(reporter=self.request.user)
        
        # 운영자에게 SSE 알림 전송
        try:
            from equipment.event_bus import publish_operator_notification
            
            payload = {
                'report_id': report.id,
                'reporter_id': report.reporter.id,
                'reporter_username': report.reporter.username,
                'report_type': report.report_type,
                'reason': report.reason,
                'status': report.status,
                'created_at': report.created_at.isoformat(),
            }
            
            # equipment 관련 정보 추가
            if report.equipment:
                payload['equipment_id'] = report.equipment.id
                payload['equipment_name'] = report.equipment.name
                payload['gym_id'] = report.equipment.gym.id
                payload['gym_name'] = report.equipment.gym.name
            
            # reported_user 정보 추가
            if report.reported_user:
                payload['reported_user_id'] = report.reported_user.id
                payload['reported_user_username'] = report.reported_user.username
            
            publish_operator_notification('report_created', payload)
            logger.info(f"📢 [Report] 운영자 알림 발송: report_id={report.id}, type={report.report_type}")
        except Exception as e:
            logger.exception(f"❌ [Report] 운영자 알림 발송 실패: {e}")
            # 알림 실패해도 신고는 정상 생성
