# equipment/serializers.py

from rest_framework import serializers
from .models import Equipment
from workouts.models import UsageSession, Reservation
from django.utils import timezone

class EquipmentSerializer(serializers.ModelSerializer):
    # gym 필드를 ID 대신 헬스장 이름으로 보여주도록 설정합니다.
    gym = serializers.ReadOnlyField(source='gym.name')
    waiting_count = serializers.SerializerMethodField()
    current_user = serializers.SerializerMethodField()
    time_remaining = serializers.SerializerMethodField()
    estimated_wait_time = serializers.SerializerMethodField()

    class Meta:
        model = Equipment
        # 모델의 모든 필드를 API에 포함시킵니다.
        fields = '__all__'

    def get_waiting_count(self, obj):
        """대기 중인 사용자 수 반환"""
        # 이미 annotate로 계산된 값이 있으면 사용
        if hasattr(obj, 'waiting_count'):
            return obj.waiting_count
        # 없으면 실시간 계산
        return Reservation.objects.filter(
            equipment=obj,
            status__in=['WAITING', 'NOTIFIED']
        ).count()
    
    def get_current_user(self, obj):
        """현재 사용 중인 사용자 이름 반환"""
        if obj.status != 'IN_USE':
            return None
            
        session = UsageSession.objects.filter(
            equipment=obj,
            end_time__isnull=True
        ).select_related('user').first()
        
        return session.user.username if session else None
    
    def get_time_remaining(self, obj):
        """현재 사용 중인 세션의 남은 시간 (분) 반환"""
        if obj.status != 'IN_USE':
            return None
            
        # 현재 진행 중인 세션 조회
        session = UsageSession.objects.filter(
            equipment=obj,
            end_time__isnull=True
        ).first()
        
        if not session:
            return None
        
        # 경과 시간 계산
        now = timezone.now()
        elapsed = now - session.start_time
        elapsed_minutes = elapsed.total_seconds() / 60
        
        # 남은 시간 = 할당 시간 - 경과 시간
        remaining = session.allocated_duration_minutes - elapsed_minutes
        
        # 음수 방지 (시간 초과한 경우 0 반환)
        return max(0, int(remaining))
    
    def get_estimated_wait_time(self, obj):
        """
        대기열 기반 예상 대기 시간 (분) 계산
        
        계산 방식:
        1. 현재 사용자의 남은 시간 (IN_USE인 경우)
        2. + 대기열의 각 사용자 할당 시간 합계
        """
        # AVAILABLE 상태면 대기 시간 0
        if obj.status == 'AVAILABLE':
            return 0
        
        total_wait = 0
        
        # 1. 현재 사용 중인 세션의 남은 시간
        if obj.status == 'IN_USE':
            time_remaining = self.get_time_remaining(obj)
            if time_remaining is not None:
                total_wait += time_remaining
        
        # 2. 대기열에 있는 모든 사용자의 할당 시간 합계
        waiting_count = self.get_waiting_count(obj)
        if waiting_count > 0:
            # 기본 세션 시간 * 대기 인원
            total_wait += obj.base_session_time_minutes * waiting_count
        
        return total_wait

    def validate(self, attrs):
        # 부분 업데이트 시 인스턴스의 기존 값을 고려
        body_part = attrs.get('body_part', getattr(self.instance, 'body_part', None))
        subcategory = attrs.get('subcategory', getattr(self.instance, 'subcategory', None))

        # subcategory는 선택사항 (NULL 허용)
        # 만약 subcategory가 지정된 경우에만 body_part와의 조합을 검증
        if subcategory:
            allowed = Equipment.SUBCATEGORY_BY_BODY_PART.get(body_part, set())
            if body_part in ('UPPER', 'LOWER') and subcategory not in allowed:
                raise serializers.ValidationError({'subcategory': '선택한 상/하체와 세부 부위 조합이 올바르지 않습니다.'})

        return attrs