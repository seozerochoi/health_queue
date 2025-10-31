from rest_framework import serializers
from .models import Equipment

class EquipmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Equipment
        # 앱에 보여줄 기구의 모든 정보를 포함합니다.
        fields = '__all__'