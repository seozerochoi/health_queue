# users/serializers.py

from django.contrib.auth.models import User
from rest_framework import serializers

# User 모델의 데이터를 JSON 형태로 번역할 Serializer
class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        # API를 통해 보여줄 필드들을 지정합니다.
        fields = ['id', 'username', 'email']

# 회원가입을 위한 Serializer를 새로 추가합니다.
class RegisterSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['username', 'password', 'email']
        # password 필드는 API 응답에 포함되지 않도록 설정합니다.
        extra_kwargs = {'password': {'write_only': True}}

    def create(self, validated_data):
        # Serializer의 create 메서드를 오버라이드하여 비밀번호를 해싱(암호화)합니다.
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password']
        )
        return user