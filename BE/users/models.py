# users/models.py

from django.db import models
from django.contrib.auth.models import User

class UserProfile(models.Model):
    # Django의 기본 User 모델과 1:1로 연결합니다.
    user = models.OneToOneField(User, on_delete=models.CASCADE)

    # 역할(MEMBER: 일반 회원, OPERATOR: 운영자)을 선택할 수 있게 합니다.
    ROLE_CHOICES = [
        ('MEMBER', 'Member'),
        ('OPERATOR', 'Operator'),
    ]
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default='MEMBER')
    
    manner_score = models.IntegerField(default=100)
    
    # AI 추천에 사용될 선택적 정보들
    gender = models.CharField(max_length=10, blank=True, null=True)
    age = models.IntegerField(blank=True, null=True)
    weight_kg = models.FloatField(blank=True, null=True)
    height_cm = models.FloatField(blank=True, null=True)
    fitness_goal = models.TextField(blank=True, null=True)
    
    EXPERIENCE_CHOICES = [
        ('BEGINNER', 'Beginner'),
        ('INTERMEDIATE', 'Intermediate'),
        ('ADVANCED', 'Advanced'),
    ]
    experience_level = models.CharField(max_length=20, choices=EXPERIENCE_CHOICES, blank=True, null=True)

    def __str__(self):
        return self.user.username