# equipment/daily_stats_models.py

from django.db import models
from django.utils import timezone
from .models import Equipment

class EquipmentDailyStats(models.Model):
    """
    기구별 일일 이용 통계
    매일 00:00에 초기화되고, 사용자가 운동을 완료할 때마다 업데이트됨
    """
    equipment = models.ForeignKey(Equipment, on_delete=models.CASCADE, related_name='daily_stats')
    date = models.DateField(default=timezone.now)
    
    # 오늘 이용 횟수
    usage_count = models.IntegerField(default=0, help_text='오늘 이용 횟수')
    
    # 총 사용 시간 (분)
    total_usage_minutes = models.IntegerField(default=0, help_text='총 사용 시간(분)')
    
    # 평균 시간 (분) - 자동 계산됨
    average_time_minutes = models.FloatField(default=0.0, help_text='평균 시간(분)')
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ('equipment', 'date')
        ordering = ['-date']
        indexes = [
            models.Index(fields=['equipment', 'date']),
            models.Index(fields=['date']),
        ]
    
    def __str__(self):
        return f"{self.equipment.name} - {self.date} (이용: {self.usage_count}회, 평균: {self.average_time_minutes:.1f}분)"
    
    def update_stats(self, session_duration_minutes):
        """
        운동 세션 완료 시 통계 업데이트
        :param session_duration_minutes: 실제 사용한 시간(분)
        """
        self.usage_count += 1
        self.total_usage_minutes += session_duration_minutes
        
        # 평균 시간 재계산
        if self.usage_count > 0:
            self.average_time_minutes = self.total_usage_minutes / self.usage_count
        
        self.save()
