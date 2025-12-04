
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
        # 여기서는 안전하게 기본값 처리하며 변환
        
        # InBody 데이터가 없으면 기본값 사용
        score = getattr(user_profile, 'inbody_score', 70)
        weight = getattr(user_profile, 'weight', 70)
        muscle = getattr(user_profile, 'skeletal_muscle_mass', 30)
        fat = getattr(user_profile, 'body_fat_mass', 15)
        height = getattr(user_profile, 'height', 175)
        fat_rate = getattr(user_profile, 'body_fat_percentage', 20)
        
        # 부위별 근육량 (없으면 표준값 가정)
        inbody = InBodyData(
            score=float(score) if score else 70.0,
            weight=float(weight) if weight else 70.0,
            muscle_mass=float(muscle) if muscle else 30.0,
            fat_mass=float(fat) if fat else 15.0,
            height=float(height) if height else 175.0,
            fat_rate=float(fat_rate) if fat_rate else 20.0,
            r_arm=100.0, l_arm=100.0, trunk=100.0, r_leg=100.0, l_leg=100.0
        )
        
        gender = 0 if user_profile.gender == 'M' else 1
        goal = 1 if user_profile.goal == 'BULKUP' else 0
        
        ai_user = AIUser(
            user_id=user_profile.user.id,
            name=user_profile.user.username,
            gender=gender,
            goal=goal,
            inbody_data=inbody
        )
        
        # AI Equipment 변환
        ai_equip = AIEquipment(
            equip_id=db_equip.id,
            name=db_equip.name,
            main_part=0 if db_equip.body_part == 'UPPER' else 1,
            sub_part=db_equip.subcategory,
            base_time=db_equip.base_session_time_minutes,
            equip_type=db_equip.type
        )
        
        # 예측 실행
        recommended_time = time_engine.predict_time(ai_user, ai_equip)
        return recommended_time

    except Exception as e:
        logger.exception(f"Error in get_ai_recommendation: {e}")
        return 15.0
