# reports/models.py

from django.db import models
from django.utils import timezone
from django.contrib.auth.models import User
from equipment.models import Equipment

class Report(models.Model):
    reporter = models.ForeignKey(User, related_name='filed_reports', on_delete=models.CASCADE)
    reported_user = models.ForeignKey(User, related_name='received_reports', on_delete=models.CASCADE, null=True, blank=True)
    equipment = models.ForeignKey(Equipment, on_delete=models.SET_NULL, null=True, blank=True)
    reason = models.TextField()
    
    TYPE_CHOICES = [
        ('malfunction', 'Malfunction'),   # 기기 고장
        ('violation', 'User Violation'),  # 사용자 문제
        ('other', 'Other'),               # 기타
    ]
    report_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='other')
    
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('RESOLVED', 'Resolved'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        if self.reported_user:
            return f'Report from {self.reporter.username} about {self.reported_user.username}'
        elif self.equipment:
            return f'Report from {self.reporter.username} about equipment {self.equipment.name}'
        else:
            return f'Report from {self.reporter.username}'


class EquipmentDailyStats(models.Model):
    """기구별 일일 이용 통계 (원래 equipment 앱에서 생성된 테이블을 그대로 사용).

    주의: db_table을 기존 테이블명으로 고정하여 실제 DB 테이블 이동 없이 소유(app)를 전환합니다.
    """
    equipment = models.ForeignKey(Equipment, on_delete=models.CASCADE, related_name='daily_stats')
    date = models.DateField(default=timezone.now)
    usage_count = models.IntegerField(default=0, help_text='오늘 이용 횟수')
    total_usage_minutes = models.IntegerField(default=0, help_text='총 사용 시간(분)')
    average_time_minutes = models.FloatField(default=0.0, help_text='평균 시간(분)')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'equipment_equipmentdailystats'
        unique_together = ('equipment', 'date')
        ordering = ['-date']
        indexes = [
            models.Index(fields=['equipment', 'date'], name='reports_equipd_equipme_idx'),
            models.Index(fields=['date'], name='reports_equipd_date_idx'),
        ]

    def __str__(self):
        return f"{self.equipment.name} - {self.date} (이용: {self.usage_count}회, 평균: {self.average_time_minutes:.1f}분)"

    def update_stats(self, session_duration_minutes: int):
        self.usage_count += 1
        self.total_usage_minutes += session_duration_minutes
        if self.usage_count > 0:
            self.average_time_minutes = self.total_usage_minutes / self.usage_count
        self.save()