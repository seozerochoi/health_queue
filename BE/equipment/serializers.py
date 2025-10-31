# equipment/serializers.py

from rest_framework import serializers
from .models import Equipment

class EquipmentSerializer(serializers.ModelSerializer):
    # gym 필드를 ID 대신 헬스장 이름으로 보여주도록 설정합니다.
    gym = serializers.ReadOnlyField(source='gym.name')

    class Meta:
        model = Equipment
        # 모델의 모든 필드를 API에 포함시킵니다.
        fields = '__all__'