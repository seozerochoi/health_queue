# gyms/serializers.py

from rest_framework import serializers
from .models import Gym, GymMembership

class GymSerializer(serializers.ModelSerializer):
    class Meta:
        model = Gym
        # 헬스장 모델의 모든 필드를 보여줍니다.
        fields = '__all__'

class GymMembershipSerializer(serializers.ModelSerializer):
    # Foreign Key로 연결된 필드의 상세 정보를 보여주기 위해 추가합니다.
    user = serializers.ReadOnlyField(source='user.username')
    gym = serializers.ReadOnlyField(source='gym.name')

    class Meta:
        model = GymMembership
        fields = '__all__'