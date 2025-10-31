# reports/serializers.py

from rest_framework import serializers
from .models import Report

class ReportSerializer(serializers.ModelSerializer):
    # 신고한 사람과 신고된 사람을 ID 대신 유저 이름으로 보여줍니다.
    reporter = serializers.ReadOnlyField(source='reporter.username')
    reported_user = serializers.ReadOnlyField(source='reported_user.username')

    class Meta:
        model = Report
        fields = '__all__'