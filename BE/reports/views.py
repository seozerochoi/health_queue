from django.shortcuts import render
# reports/views.py

from rest_framework import viewsets
# IsAuthenticated를 import 합니다.
from rest_framework.permissions import IsAuthenticated
from .models import Report
from .serializers import ReportSerializer

class ReportViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated] # <- 이 줄 추가
    queryset = Report.objects.all()
    serializer_class = ReportSerializer