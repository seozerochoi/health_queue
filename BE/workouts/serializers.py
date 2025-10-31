# workouts/serializers.py

from rest_framework import serializers
from .models import UsageSession, Reservation

class UsageSessionSerializer(serializers.ModelSerializer):
    # 관련 필드를 이름으로 보여주도록 설정
    user = serializers.ReadOnlyField(source='user.username')
    equipment = serializers.ReadOnlyField(source='equipment.name')

    class Meta:
        model = UsageSession
        fields = '__all__'

class ReservationSerializer(serializers.ModelSerializer):
    user = serializers.ReadOnlyField(source='user.username')
    equipment = serializers.ReadOnlyField(source='equipment.name')
    
    class Meta:
        model = Reservation
        fields = '__all__'