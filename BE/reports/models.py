# reports/models.py

from django.db import models
from django.contrib.auth.models import User
from equipment.models import Equipment

class Report(models.Model):
    reporter = models.ForeignKey(User, related_name='filed_reports', on_delete=models.CASCADE)
    reported_user = models.ForeignKey(User, related_name='received_reports', on_delete=models.CASCADE)
    equipment = models.ForeignKey(Equipment, on_delete=models.SET_NULL, null=True, blank=True)
    reason = models.TextField()
    
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('RESOLVED', 'Resolved'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'Report from {self.reporter.username} about {self.reported_user.username}'