# users/serializers.py

from django.contrib.auth.models import User
from rest_framework import serializers, generics
from .models import UserProfile
import logging

logger = logging.getLogger(__name__)

# User 모델의 데이터를 JSON 형태로 번역할 Serializer
class UserSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    name = serializers.CharField(source='first_name', read_only=True)

    class Meta:
        model = User
        # API를 통해 보여줄 필드들을 지정합니다.
        fields = ['id', 'username', 'email', 'name', 'role', 'is_staff']

    def get_role(self, obj):
        # UserProfile에서 role 가져오기
        try:
            profile = obj.userprofile
            return profile.role
        except UserProfile.DoesNotExist:
            return 'MEMBER'

# 회원가입을 위한 Serializer를 새로 추가합니다.
class RegisterSerializer(serializers.ModelSerializer):
    # role 필드 추가 (write_only: 요청에서만 사용하고 응답에는 포함하지 않음)
    role = serializers.ChoiceField(
        choices=['MEMBER', 'OPERATOR'],
        default='MEMBER',
        write_only=True
    )
    # name 필드 추가 (선택적)
    name = serializers.CharField(max_length=150, required=False, write_only=True)

    class Meta:
        model = User
        fields = ['username', 'password', 'email', 'role', 'name']
        # password 필드는 API 응답에 포함되지 않도록 설정합니다.
        extra_kwargs = {'password': {'write_only': True}}

    def create(self, validated_data):
        import sys
        
        # role과 name을 추출 (validated_data에서 제거)
        role = validated_data.pop('role', 'MEMBER')
        name = validated_data.pop('name', '')
        
        # 디버깅: 받은 role 값 출력
        log_msg = f"[REGISTER START] username={validated_data.get('username')} | role={role} | name={name}"
        print(log_msg, flush=True)
        sys.stdout.flush()
        logger.info(log_msg)
        
        # role이 'OPERATOR'인 경우 is_staff를 True로 설정
        is_staff_value = (role == 'OPERATOR')
        staff_log = f"[REGISTER] role={role} → is_staff={is_staff_value}"
        print(staff_log, flush=True)
        sys.stdout.flush()
        logger.info(staff_log)
        
        # User 생성 - is_staff를 직접 설정
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password'],
            is_staff=is_staff_value,
            first_name=name
        )
        
        user_log = f"[REGISTER] User Created: id={user.id} | username={user.username} | is_staff={user.is_staff} | is_superuser={user.is_superuser}"
        print(user_log, flush=True)
        sys.stdout.flush()
        logger.info(user_log)
        
        # UserProfile 생성 (role 저장)
        from users.models import UserProfile
        profile = UserProfile.objects.create(user=user, role=role)
        
        profile_log = f"[REGISTER] UserProfile Created: username={user.username} | role={profile.role}"
        print(profile_log, flush=True)
        sys.stdout.flush()
        logger.info(profile_log)
        
        return user
    
class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            print("유효성 검사 실패:", serializer.errors)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        return super().post(request, *args, **kwargs)


# 사용자 프로필 조회/수정용 Serializer
class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = [
            'gender', 'age', 'height_cm', 'weight_kg', 'experience_level',
            'exercise_goal', 'inbody_score', 'bmi', 'body_fat_percentage',
            'skeletal_muscle_mass_kg', 'body_fat_mass_kg',
            'segment_right_arm_kg', 'segment_left_arm_kg', 'segment_trunk_kg',
            'segment_right_leg_kg', 'segment_left_leg_kg',
        ]