# reports/serializers.py

from rest_framework import serializers
from .models import Report

class ReportSerializer(serializers.ModelSerializer):
    # 신고한 사람과 신고된 사람을 ID 대신 유저 이름으로 보여줍니다.
    reporter = serializers.ReadOnlyField(source='reporter.username')
    reported_user = serializers.ReadOnlyField(source='reported_user.username')
    equipment_name = serializers.SerializerMethodField()

    class Meta:
        model = Report
        fields = ['id', 'reporter', 'reported_user', 'equipment',
                  'equipment_name', 'report_type', 'reason', 'status', 'created_at']
    
    def get_equipment_name(self, obj):
        """기구 이름을 반환합니다. 기구 정보가 없으면 None 반환"""
        return obj.equipment.name if obj.equipment else None