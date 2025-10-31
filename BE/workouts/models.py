# workouts/models.py

from django.db import models
from django.contrib.auth.models import User
from equipment.models import Equipment

class UsageSession(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    equipment = models.ForeignKey(Equipment, on_delete=models.CASCADE)
    start_time = models.DateTimeField(auto_now_add=True)
    end_time = models.DateTimeField(null=True, blank=True)
    allocated_duration_minutes = models.IntegerField()
    
    SESSION_TYPE_CHOICES = [
        ('BASE', 'Base'),
        ('AI_RECOMMENDED', 'AI Recommended'),
        ('EXTENDED', 'Extended'),
    ]
    session_type = models.CharField(max_length=20, choices=SESSION_TYPE_CHOICES)

    def __str__(self):
        return f'{self.user.username} used {self.equipment.name} at {self.start_time}'

class Reservation(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    equipment = models.ForeignKey(Equipment, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    
    STATUS_CHOICES = [
        ('WAITING', 'Waiting'),
        ('NOTIFIED', 'Notified'),
        ('EXPIRED', 'Expired'),
        ('COMPLETED', 'Completed'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='WAITING')
    notified_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f'{self.user.username} reserved {self.equipment.name}'