# ai_model/models.py

from django.db import models
from django.contrib.auth.models import User
from equipment.models import Equipment


class UserTimeRecord(models.Model):
    """
    사용자의 운동 시간 기록을 저장하는 모델.
    DQN이 '비슷한 사용자'를 찾아 학습하는 데 사용됩니다.
    """
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='time_records')
    equipment = models.ForeignKey(Equipment, on_delete=models.CASCADE, related_name='time_records')
    
    # 사용자 Feature Vector (14개 요소를 JSON으로 저장)
    # [score, fat_rate, muscle_mass, height, bmi, gender, goal, 
    #  main_part, is_cardio, x1, rel_obesity, muscle_fat_ratio, x4, imbalance]
    features = models.JSONField(help_text="AI Feature Vector (14-dim)")
    
    # 공식으로 계산된 기본 시간
    formula_time = models.FloatField(help_text="FormulaEngine이 계산한 기본 시간 (분)")
    
    # DQN이 선택한 행동 (조정값)
    action_idx = models.IntegerField(default=2, help_text="DQN Action Index (0-4)")
    adjustment = models.FloatField(default=0.0, help_text="시간 조정값 (분)")
    
    # 최종 추천/사용 시간
    recommended_time = models.FloatField(help_text="최종 추천 시간 (분)")
    actual_time = models.FloatField(null=True, blank=True, help_text="실제 사용 시간 (분)")
    
    # 사용자 피드백 (1~5점)
    # 1: 매우 부족, 2: 부족, 3: 적절, 4: 과도, 5: 매우 과도
    feedback_score = models.IntegerField(null=True, blank=True, help_text="사용자 피드백 (1-5)")
    
    # 학습에 사용된 보상값
    reward = models.FloatField(null=True, blank=True, help_text="DQN 학습 보상")
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'equipment']),
            models.Index(fields=['created_at']),
        ]
    
    def __str__(self):
        return f"TimeRecord(user={self.user_id}, equip={self.equipment_id}, time={self.recommended_time})"
