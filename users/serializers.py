# users/serializers.py (새 파일)

from rest_framework import serializers
from .models import User

class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=True, style={'input_type': 'password'})

    class Meta:
        model = User
        # 회원가입 시 이메일과 비밀번호만 받습니다.
        fields = ('email', 'password')

    def create(self, validated_data):
        # ModelSerializer의 기본 create를 사용하지 않고, 비밀번호를 해싱(암호화)하여 저장합니다.
        user = User.objects.create_user(
            email=validated_data['email'],
            username=validated_data['email'], # username 필드도 채워줍니다.
            password=validated_data['password']
        )
        return user