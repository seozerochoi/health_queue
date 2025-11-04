# users/serializers.py

from django.contrib.auth.models import User
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import UserProfile

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
        role = validated_data.pop('role', 'MEMBER')  # 기본값은 'MEMBER'
        user = User.objects.create_user(**validated_data)

        # UserProfile 생성 및 role 설정
        user_profile = UserProfile.objects.create(user=user, role=role)

        # role에 따라 is_staff 설정
        if role == 'OPERATOR':
            user.is_staff = True
        else:
            user.is_staff = False
        user.save()

        return user
    
class MyTokenObtainPairSerializer(TokenObtainPairSerializer):
    
    @classmethod
    def get_token(cls, user):
        # 기본 토큰을 생성합니다.
        token = super().get_token(user)
        
        # (선택 사항) 토큰 자체에 username을 넣을 수도 있습니다.
        # token['username'] = user.username
        return token

    def validate(self, attrs):
        # 기본 validate 메서드를 호출하여 토큰(access, refresh)을 가져옵니다.
        data = super().validate(attrs)

        # 2. 기본 토큰 데이터에 우리가 원하는 추가 정보를 덧붙입니다.
        
        # 'username' 추가
        data['username'] = self.user.username
        
        # 'role' 추가
        try:
            # 사용자에 연결된 UserProfile을 찾습니다.
            profile = UserProfile.objects.get(user=self.user)
            data['role'] = profile.role
        except UserProfile.DoesNotExist:
            # 프로필이 없는 경우 (예: admin 계정) 기본값을 설정합니다.
            if self.user.is_superuser:
                data['role'] = 'ADMIN'
            else:
                data['role'] = 'MEMBER'

        # 3. 추가 정보가 포함된 data를 반환합니다.
        return data