# equipment/serializers.py

from rest_framework import serializers
from .models import Equipment
from workouts.models import UsageSession, Reservation
from django.utils import timezone
from django.apps import apps
from ai_model.time_ai import User as AIUser, InBodyData, Equipment as AIEquipment, AIEngine

class EquipmentSerializer(serializers.ModelSerializer):
    # gym 필드를 ID 대신 헬스장 이름으로 보여주도록 설정합니다.
    gym = serializers.ReadOnlyField(source='gym.name')
    waiting_count = serializers.SerializerMethodField()
    current_user = serializers.SerializerMethodField()
    time_remaining = serializers.SerializerMethodField()
    estimated_wait_time = serializers.SerializerMethodField()
    ai_recommended_time = serializers.SerializerMethodField()

    class Meta:
        model = Equipment
        # 모델의 모든 필드를 API에 포함시킵니다.
        fields = '__all__'

    def get_ai_recommended_time(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None
        
        try:
            profile = request.user.userprofile
        except:
            return None

        # Helper to safely get float
        def n(v):
            try:
                return float(v) if v is not None else 0.0
            except:
                return 0.0

        inbody = InBodyData(
            score=n(profile.inbody_score),
            weight=n(profile.weight_kg),
            muscle_mass=n(profile.skeletal_muscle_mass_kg),
            fat_mass=n(profile.body_fat_mass_kg),
            height=n(profile.height_cm),
            fat_rate=n(profile.body_fat_percentage),
            r_arm=n(profile.segment_right_arm_percent),
            l_arm=n(profile.segment_left_arm_percent),
            trunk=n(profile.segment_trunk_percent),
            r_leg=n(profile.segment_right_leg_percent),
            l_leg=n(profile.segment_left_leg_percent)
        )

        gender_raw = (profile.gender or '').strip()
        gender_num = 0 if gender_raw.lower().startswith('m') or gender_raw in ['0', 0] else 1
        
        goal_raw = (profile.exercise_goal or '').upper()
        goal_num = 0 if goal_raw == 'DIET' else 1

        ai_user = AIUser(
            user_id=request.user.id,
            name=request.user.username,
            gender=gender_num,
            goal=goal_num,
            inbody_data=inbody
        )

        # Map Equipment
        # main_part: 0: Upper, 1: Lower
        # obj.body_part is 'UPPER', 'LOWER', 'CORE', 'WHOLE'
        main_part = 1 if obj.body_part == 'LOWER' else 0 
        
        ai_equip = AIEquipment(
            equip_id=obj.id,
            name=obj.name,
            main_part=main_part,
            sub_part=obj.subcategory or "General",
            base_time=obj.base_session_time_minutes,
            equip_type=obj.type
        )

        # Get Engine
        try:
            app_config = apps.get_app_config('ai_model')
            time_engine = getattr(app_config, 'time_ai_engine', None)
            
            if not time_engine:
                # Fallback if not initialized
                time_engine = AIEngine()
                try:
                    time_engine.load_checkpoint("time_ai_checkpoint.pth")
                except:
                    pass
                if not getattr(time_engine, 'is_trained', False):
                    time_engine.pretrain_with_formula()
                app_config.time_ai_engine = time_engine
            
            predicted_time = time_engine.predict_time(ai_user, ai_equip)
            return round(predicted_time, 1)
        except Exception as e:
            # print(f"AI Prediction Error: {e}")
            return None

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
    
    def _get_time_engine(self):
        try:
            app_config = apps.get_app_config('ai_model')
            time_engine = getattr(app_config, 'time_ai_engine', None)
            
            if not time_engine:
                time_engine = AIEngine()
                try:
                    time_engine.load_checkpoint("time_ai_checkpoint.pth")
                except:
                    pass
                if not getattr(time_engine, 'is_trained', False):
                    time_engine.pretrain_with_formula()
                app_config.time_ai_engine = time_engine
            return time_engine
        except:
            return None

    def get_estimated_wait_time(self, obj):
        """
        대기열 기반 예상 대기 시간 (분) 계산
        
        [User Request Logic]
        A(사용중) + C(대기1) + D(대기2) ... 의 모든 AI 추천 시간을 합산하여 반환
        """
        # AVAILABLE 상태면 대기 시간 0
        if obj.status == 'AVAILABLE':
            return 0
        
        total_wait = 0.0
        
        # 1. 현재 사용 중인 세션의 남은 시간 (A의 시간)
        # 이미 AI로 할당된 시간이 있다면 그것을 기준으로 남은 시간 계산
        if obj.status == 'IN_USE':
            session = UsageSession.objects.filter(
                equipment=obj,
                end_time__isnull=True
            ).first()
            
            if session:
                now = timezone.now()
                elapsed_minutes = (now - session.start_time).total_seconds() / 60.0
                remaining = max(0.0, session.allocated_duration_minutes - elapsed_minutes)
                total_wait += remaining
        
        # 2. 대기열에 있는 모든 사용자의 할당 시간 합계 (C, D...의 시간)
        # Prefetch된 reservation_set을 사용하여 DB 쿼리 최소화
        if hasattr(obj, '_prefetched_objects_cache') and 'reservation_set' in obj._prefetched_objects_cache:
            reservations = [
                r for r in obj.reservation_set.all() 
                if r.status in ['WAITING', 'NOTIFIED']
            ]
        else:
            reservations = Reservation.objects.filter(
                equipment=obj, 
                status__in=['WAITING', 'NOTIFIED']
            ).select_related('user__userprofile')
        
        if not reservations:
            return int(round(total_wait))

        # Get AI Engine
        time_engine = self._get_time_engine()

        # Helper to safely get float
        def n(v):
            try:
                return float(v) if v is not None else 0.0
            except:
                return 0.0

        # Map Equipment for AI
        main_part = 1 if obj.body_part == 'LOWER' else 0 
        ai_equip = AIEquipment(
            equip_id=obj.id,
            name=obj.name,
            main_part=main_part,
            sub_part=obj.subcategory or "General",
            base_time=obj.base_session_time_minutes,
            equip_type=obj.type
        )

        for res in reservations:
            user_time = obj.base_session_time_minutes # Default fallback
            
            if time_engine:
                try:
                    # Prefetch된 userprofile 사용 시도
                    try:
                        profile = res.user.userprofile
                    except:
                        profile = None

                    if profile:
                        inbody = InBodyData(
                            score=n(profile.inbody_score),
                            weight=n(profile.weight_kg),
                            muscle_mass=n(profile.skeletal_muscle_mass_kg),
                            fat_mass=n(profile.body_fat_mass_kg),
                            height=n(profile.height_cm),
                            fat_rate=n(profile.body_fat_percentage),
                            r_arm=n(profile.segment_right_arm_percent),
                            l_arm=n(profile.segment_left_arm_percent),
                            trunk=n(profile.segment_trunk_percent),
                            r_leg=n(profile.segment_right_leg_percent),
                            l_leg=n(profile.segment_left_leg_percent)
                        )

                        gender_raw = (profile.gender or '').strip()
                        gender_num = 0 if gender_raw.lower().startswith('m') or gender_raw in ['0', 0] else 1
                        
                        goal_raw = (profile.exercise_goal or '').upper()
                        goal_num = 0 if goal_raw == 'DIET' else 1

                        ai_user = AIUser(
                            user_id=res.user.id,
                            name=res.user.username,
                            gender=gender_num,
                            goal=goal_num,
                            inbody_data=inbody
                        )
                        
                        predicted_time = time_engine.predict_time(ai_user, ai_equip)
                        user_time = predicted_time
                except Exception:
                    pass
            
            total_wait += user_time
        
        return int(round(total_wait))

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