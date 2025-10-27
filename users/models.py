from django.contrib.auth.models import AbstractUser
from django.db import models

class User(AbstractUser):
    fcm_token = models.CharField(max_length=255, null=True, blank=True) # FCM 기기 토큰
    # 기획서에 있는 사용자 역할을 선택지로 만듭니다.
    class Role(models.TextChoices):
        USER = "USER", "일반 사용자"
        TRAINER = "TRAINER", "트레이너"
        ADMIN = "ADMIN", "관리자"

    # 기본 username 대신 email을 ID로 사용하도록 설정합니다.
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.USER)
    manner_score = models.IntegerField(default=50) # 매너온도 점수 [cite: 70]
    
    # 추가적인 사용자 프로필 정보 (AI 추천에 필요)
    # 예: birth_date, gender, weight, height, career_level 등
    # 이 부분은 나중에 AI 기능을 만들 때 추가하겠습니다.

    USERNAME_FIELD = 'email' # 로그인 ID로 email을 사용
    REQUIRED_FIELDS = ['username'] # createsuperuser 시 필요

    def __str__(self):
        return self.email