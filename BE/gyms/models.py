# gyms/models.py

from django.db import models
from django.contrib.auth.models import User

class Gym(models.Model):
    owner = models.ForeignKey(User, on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    address = models.CharField(max_length=255)

    def __str__(self):
        return self.name

class GymMembership(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    gym = models.ForeignKey(Gym, on_delete=models.CASCADE)
    
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected'),
    ]
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='PENDING')
    join_date = models.DateField(auto_now_add=True)

    class Meta:
        # 한 명의 유저가 같은 헬스장에 중복으로 가입할 수 없도록 설정합니다.
        unique_together = ('user', 'gym')

    def __str__(self):
        return f'{self.user.username} - {self.gym.name}'