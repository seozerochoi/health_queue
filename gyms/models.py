from django.db import models
from users.models import User # 관리자(헬스장 주인)를 연결하기 위함

class Gym(models.Model):
    owner = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    name = models.CharField(max_length=100)
    address = models.CharField(max_length=255)
    # ... 운영 시간 등 추가 정보 ...
    
    def __str__(self):
        return self.name

class Equipment(models.Model):
    # 기획서에 나온 기구의 상태를 선택지로 만듭니다.
    class Status(models.TextChoices):
        AVAILABLE = "AVAILABLE", "사용 가능"  # 비어있는 상태 [cite: 57]
        IN_USE = "IN_USE", "사용 중"        # 사용 중인 상태
        MAINTENANCE = "MAINTENANCE", "점검 중" # 고장/점검 상태 
        LOCKED = "LOCKED", "잠김"         # 사용시간 종료 후 잠긴 상태

    gym = models.ForeignKey(Gym, on_delete=models.CASCADE, related_name='equipments')
    name = models.CharField(max_length=100)
    
    # AI 루틴 추천 시 카테고리별로 기구를 추천해주기 위함
    category = models.CharField(max_length=50, help_text="예: 유산소, 상체 근력, 하체 근력 등")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.AVAILABLE)
    
    # 대기자가 있을 때 적용되는 '기본 이용 시간' [cite: 86]
    base_usage_time = models.IntegerField(default=15, help_text="기본 이용 시간(분)")

    def __str__(self):
        return f'[{self.gym.name}] {self.name}'