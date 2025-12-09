
import logging
from django.apps import apps
from .time_ai import AIEquipment

logger = logging.getLogger(__name__)

def get_ai_recommendation(user_profile, ai_model_id, ratios):
    """
    workouts/views.py에서 호출하는 AI 추천 함수 래퍼.
    TimeAI 엔진을 사용하여 시간을 예측합니다.
    
    Args:
        user_profile (UserProfile): 사용자 프로필 객체
        ai_model_id (int): 기구 ID (Equipment PK)
        ratios (dict): 상/하체 비율 (현재는 사용 안 함, 호환성 유지)
    
    Returns:
        float: 추천 시간 (분)
    """
    try:
        # AppConfig에서 로드된 AI 엔진 가져오기
        ai_config = apps.get_app_config('ai_model')
        time_engine = ai_config.time_ai_engine
        
        if not time_engine:
            logger.error("TimeAI engine is not initialized.")
            return 15.0 # 기본값

        # Equipment DB 객체 가져오기 (순환 참조 방지를 위해 안에서 import)
        from equipment.models import Equipment
        try:
            db_equip = Equipment.objects.get(pk=ai_model_id)
        except Equipment.DoesNotExist:
            logger.error(f"Equipment {ai_model_id} not found.")
            return 15.0

        # AI User 변환 (views.py의 로직 재사용 또는 직접 변환)
        # 여기서는 time_ai.py의 User 클래스에 맞게 변환
        from .time_ai import User as AIUser, InBodyData
        
        # UserProfile -> AI User 변환
        # (주의: UserProfile 필드가 time_ai.py의 요구사항과 일치해야 함)
        
        # Helper to safely get float
        def n(v, default=0.0):
            try:
                return float(v) if v is not None else default
            except:
                return default

        # InBody 데이터 매핑 (UserProfile 필드명 사용)
        score = n(getattr(user_profile, 'inbody_score', 70), 70.0)
        weight = n(getattr(user_profile, 'weight_kg', 70), 70.0)
        muscle = n(getattr(user_profile, 'skeletal_muscle_mass_kg', 30), 30.0)
        fat = n(getattr(user_profile, 'body_fat_mass_kg', 15), 15.0)
        height = n(getattr(user_profile, 'height_cm', 175), 175.0)
        fat_rate = n(getattr(user_profile, 'body_fat_percentage', 20), 20.0)
        
        # 부위별 근육량 (없으면 표준값 100% 가정)
        r_arm = n(getattr(user_profile, 'segment_right_arm_percent', 100), 100.0)
        l_arm = n(getattr(user_profile, 'segment_left_arm_percent', 100), 100.0)
        trunk = n(getattr(user_profile, 'segment_trunk_percent', 100), 100.0)
        r_leg = n(getattr(user_profile, 'segment_right_leg_percent', 100), 100.0)
        l_leg = n(getattr(user_profile, 'segment_left_leg_percent', 100), 100.0)

        inbody = InBodyData(
            score=score,
            weight=weight,
            muscle_mass=muscle,
            fat_mass=fat,
            height=height,
            fat_rate=fat_rate,
            r_arm=r_arm, l_arm=l_arm, trunk=trunk, r_leg=r_leg, l_leg=l_leg
        )
        
        # 성별 처리 (0: Male, 1: Female)
        gender_raw = str(getattr(user_profile, 'gender', 'M')).upper()
        gender = 1 if gender_raw.startswith('F') or gender_raw == 'WOMAN' else 0
        
        # 목표 처리 (0: Diet, 1: Bulk-up)
        goal_raw = str(getattr(user_profile, 'exercise_goal', 'DIET')).upper()
        goal = 1 if goal_raw == 'MUSCLE_GAIN' or goal_raw == 'BULKUP' else 0
        
        ai_user = AIUser(
            user_id=user_profile.user.id,
            name=user_profile.user.username,
            gender=gender,
            goal=goal,
            inbody_data=inbody
        )
        
        # AI Equipment 변환
        # main_part: 0: Upper, 1: Lower (time_ai.py 기준)
        # DB body_part: UPPER, LOWER, CORE, CARDIO, ETC
        main_part = 1 if db_equip.body_part == 'LOWER' else 0
        
        ai_equip = AIEquipment(
            equip_id=db_equip.id,
            name=db_equip.name,
            main_part=main_part,
            sub_part=db_equip.subcategory or "General",
            equip_type=db_equip.type
        )
        
        # 예측 실행
        recommended_time = time_engine.predict_time(ai_user, ai_equip)
        logger.info(f"🤖 AI Prediction: User={ai_user.name}, Equip={ai_equip.name} -> {recommended_time:.1f} min")
        return recommended_time

    except Exception as e:
        logger.exception(f"Error in get_ai_recommendation: {e}")
        return 15.0
