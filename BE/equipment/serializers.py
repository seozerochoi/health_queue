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

    def validate(self, attrs):
        # 부분 업데이트 시 인스턴스의 기존 값을 고려
        body_part = attrs.get('body_part', getattr(self.instance, 'body_part', None))
        subcategory = attrs.get('subcategory', getattr(self.instance, 'subcategory', None))

        allowed = Equipment.SUBCATEGORY_BY_BODY_PART.get(body_part, set())

        if body_part in ('UPPER', 'LOWER'):
            if not subcategory:
                raise serializers.ValidationError({'subcategory': '상체/하체 선택 시 세부 부위를 반드시 지정해야 합니다.'})
            if subcategory not in allowed:
                raise serializers.ValidationError({'subcategory': '선택한 상/하체와 세부 부위 조합이 올바르지 않습니다.'})
        else:
            if subcategory:
                raise serializers.ValidationError({'subcategory': '코어/유산소/기타 카테고리에서는 세부 부위를 비워두세요.'})

        return attrs