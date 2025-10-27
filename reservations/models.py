from django.db import models
from users.models import User
from gyms.models import Equipment

# 현재 누가 어떤 기구를 사용하고 있는지 기록
class UsageLog(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='usage_logs')
    equipment = models.OneToOneField(Equipment, on_delete=models.CASCADE, related_name='current_usage')
    start_time = models.DateTimeField(auto_now_add=True)
    # AI 추천 시간 또는 기본 시간이 적용된 예상 종료 시간
    expected_end_time = models.DateTimeField()

    def __str__(self):
        return f'{self.user.email} is using {self.equipment.name}'

# 특정 기구의 대기열
class WaitlistEntry(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='waitlist_entries')
    equipment = models.ForeignKey(Equipment, on_delete=models.CASCADE, related_name='waitlist')
    timestamp = models.DateTimeField(auto_now_add=True) # 대기열 등록 시간(선착순)

    class Meta:
        # 한 사용자는 같은 기구에 한 번만 대기할 수 있도록 설정
        unique_together = ('user', 'equipment')
        ordering = ['timestamp'] # 등록된 순서대로 정렬

    def __str__(self):
        return f'{self.user.email} is waiting for {self.equipment.name}'