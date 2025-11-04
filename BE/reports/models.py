# reports/models.py

from django.db import models
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