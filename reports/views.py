from django.shortcuts import render
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from .models import Report
from .serializers import ReportSerializer # Serializer도 만들어야 합니다.

class ReportViewSet(viewsets.ModelViewSet):
    queryset = Report.objects.all()
    serializer_class = ReportSerializer

    def get_permissions(self):
        # 신고 생성(create)은 누구나, 나머지는 관리자만 가능
        if self.action == 'create':
            self.permission_classes = [IsAuthenticated]
        else:
            self.permission_classes = [IsAdminUser]
        return super().get_permissions()

    def perform_create(self, serializer):
        # 신고자는 현재 로그인한 사용자로 자동 설정
        serializer.save(reporter=self.request.user)