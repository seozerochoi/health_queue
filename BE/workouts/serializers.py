# workouts/serializers.py

from rest_framework import serializers
from .models import UsageSession, Reservation
from django.utils import timezone
from django.conf import settings
from datetime import timedelta
try:
    # Import the default timeout from constants (not tasks) to avoid loading Celery
    from .constants import DEFAULT_NOTIFICATION_TIMEOUT_MINUTES
except Exception:
    DEFAULT_NOTIFICATION_TIMEOUT_MINUTES = None


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

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # If this reservation has been notified, expose an expires_at timestamp so FE can countdown

        if instance.status == 'NOTIFIED' and instance.notified_at:
            # configurable timeout in seconds; prefer explicit seconds setting, then tasks constant,
            # then an optional minutes setting in settings, finally fall back to 15 seconds.
            timeout_seconds = getattr(settings, 'WORKOUT_NOTIFICATION_TIMEOUT_SECONDS', None)
            if timeout_seconds is None:
                if DEFAULT_NOTIFICATION_TIMEOUT_MINUTES is not None:
                    try:
                        timeout_seconds = int(float(DEFAULT_NOTIFICATION_TIMEOUT_MINUTES) * 60)
                    except Exception:
                        timeout_seconds = 15
                else:
                    # try minutes-based setting in Django settings, if present
                    minutes_setting = getattr(settings, 'WORKOUT_NOTIFICATION_TIMEOUT_MINUTES', None)
                    if minutes_setting is not None:
                        try:
                            timeout_seconds = int(float(minutes_setting) * 60)
                        except Exception:
                            timeout_seconds = 15
                    else:
                        timeout_seconds = 15

            expires_at = instance.notified_at + timedelta(seconds=timeout_seconds)
            # ensure timezone-aware ISO format
            data['notification_expires_at'] = expires_at.isoformat()
            data['notification_timeout_seconds'] = timeout_seconds
        else:
            data['notification_expires_at'] = None
            data['notification_timeout_seconds'] = None

        return data