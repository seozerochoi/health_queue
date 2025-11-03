# equipment/models.py

from django.db import models
from gyms.models import Gym

class Equipment(models.Model):
    gym = models.ForeignKey(Gym, on_delete=models.CASCADE)
    name = models.CharField(max_length=100)
    
    TYPE_CHOICES = [
        ('CARDIO', 'Cardio'),
        ('STRENGTH', 'Strength'),
        ('ETC', 'Etc'),
    ]
    type = models.CharField(max_length=50, choices=TYPE_CHOICES)
    
    nfc_tag_id = models.CharField(max_length=100, unique=True)
    arduino_id = models.CharField(max_length=100, unique=True)
    
    STATUS_CHOICES = [
        ('AVAILABLE', 'Available'),
        ('IN_USE', 'In Use'),
        ('OUT_OF_ORDER', 'Out of Order'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='AVAILABLE')
    base_session_time_minutes = models.IntegerField(default=15)

    BODY_PART_CHOICES = [
        ('UPPER', '상체'),
        ('LOWER', '하체'),
        ('CORE', '코어'),
        ('CARDIO', '유산소'),
        ('ETC', '기타'),
    ]
    body_part = models.CharField(
        max_length=10, 
        choices=BODY_PART_CHOICES, 
        default='ETC',
        help_text="이 기구의 주요 운동 부위 (AI 비율 계산에 사용)"
    )
    ai_model_id = models.IntegerField(
        default=0, 
        help_text="AI 모델이 인식하는 기구 ID (training_script.py와 일치해야 함, 예: 0=벤치)"
    )

    def __str__(self):
        return f'{self.gym.name} - {self.name}'