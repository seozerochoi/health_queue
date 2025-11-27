from django.db import models
from django.contrib.auth.models import User

class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    name = models.CharField(max_length=50)
    gender = models.IntegerField(choices=[(0, 'Male'), (1, 'Female')], default=0)
    # 0: Diet, 1: Bulk-up
    goal = models.IntegerField(choices=[(0, 'Diet'), (1, 'BulkUp')], default=1)
    
    # [InBody Data - 보내주신 코드의 필드 완벽 대응]
    height = models.FloatField()
    weight = models.FloatField()
    muscle_mass = models.FloatField()
    fat_mass = models.FloatField()
    fat_rate = models.FloatField()
    inbody_score = models.FloatField()
    
    # 부위별 근육량
    r_arm = models.FloatField(default=100)
    l_arm = models.FloatField(default=100)
    trunk = models.FloatField(default=100)
    r_leg = models.FloatField(default=100)
    l_leg = models.FloatField(default=100)

class Equipment(models.Model):
    name = models.CharField(max_length=100)
    
    # AI 입력용 매핑 데이터
    # 0: Upper, 1: Lower
    main_part = models.IntegerField(choices=[(0, 'Upper'), (1, 'Lower')]) 
    # Chest, Back, Legs, Cardio 등
    sub_part = models.CharField(max_length=50) 
    
    # 루틴 추천용 메타데이터
    difficulty = models.CharField(max_length=10, choices=[('HIGH','상'), ('MID','중'), ('LOW','하')], default='MID')
    is_occupied = models.BooleanField(default=False) # 현재 사용중 여부

    def __str__(self):
        return self.name