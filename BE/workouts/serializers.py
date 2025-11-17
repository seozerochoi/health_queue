# workouts/serializers.py

from rest_framework import serializers
from .models import UsageSession, Reservation


class UsageSessionSerializer(serializers.ModelSerializer):
    # 관련 필드를 이름으로 보여주도록 설정
    user = serializers.ReadOnlyField(source='user.username')
    equipment = serializers.ReadOnlyField(source='equipment.name')
    equipment_id = serializers.SerializerMethodField()

    def get_equipment_id(self, obj):
        return obj.equipment.id if obj.equipment else None

    class Meta:
        model = UsageSession
        fields = (
            'id', 'user', 'equipment', 'equipment_id', 'start_time', 'end_time',
            'allocated_duration_minutes', 'session_type'
        )


class ReservationSerializer(serializers.ModelSerializer):
    user = serializers.ReadOnlyField(source='user.username')
    equipment = serializers.ReadOnlyField(source='equipment.name')

    # Extra equipment metadata for FE convenience
    equipment_id = serializers.SerializerMethodField()
    equipment_image = serializers.SerializerMethodField()
    equipment_allocated_time = serializers.SerializerMethodField()

    # Queue-related fields
    waiting_position = serializers.SerializerMethodField()
    waiting_count = serializers.SerializerMethodField()

    def get_equipment_id(self, obj):
        return obj.equipment.id if obj.equipment else None

    def get_equipment_image(self, obj):
        # equipment may have image_url field
        return getattr(obj.equipment, 'image_url', None)

    def get_equipment_allocated_time(self, obj):
        return getattr(obj.equipment, 'base_session_time_minutes', None)

    def get_waiting_count(self, obj):
        return Reservation.objects.filter(equipment=obj.equipment, status='WAITING').count()

    def get_waiting_position(self, obj):
        # If user has been notified, treat as position 1
        if obj.status == 'NOTIFIED':
            return 1

        # Build ordered waiting list and find index
        waiting_qs = Reservation.objects.filter(equipment=obj.equipment, status='WAITING').order_by('created_at')
        waiting_list = list(waiting_qs)
        try:
            return waiting_list.index(obj) + 1
        except ValueError:
            # Not in waiting list (maybe status changed)
            return None

    class Meta:
        model = Reservation
        fields = (
            'id', 'user', 'equipment', 'equipment_id', 'equipment_image', 'equipment_allocated_time',
            'created_at', 'status', 'notified_at', 'waiting_position', 'waiting_count'
        )