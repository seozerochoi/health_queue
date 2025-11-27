# 기존 Django 앱의 모델 import
from users.models import UserProfile
from equipment.models import Equipment
from django.db.models import Q
# 보내주신 시간 AI 코드 import
from ai_model.time_ai import AIEngine, User, InBodyData, Equipment as TimeAIEquipment
# 새로 만든 루틴 AI 코드 import
from ai_model.routine_ai import RoutineRanker

# AI 엔진 인스턴스화 (메모리에 로드)
time_ai_engine = AIEngine()
time_ai_engine.pretrain_with_formula() # Cold Start 방지 학습

routine_ai_engine = RoutineRanker()

class SmartService:
    
    def _to_time_ai_format(self, db_user, db_equip):
        """Django DB 데이터를 시간 AI용 클래스로 변환하는 어댑터
        
        기존 DB 필드명 매핑:
        - users.UserProfile -> time_ai.User
        - equipment.Equipment -> time_ai.Equipment
        """
        # gender: MALE/FEMALE -> 0/1 변환
        gender_numeric = 1 if db_user.gender == 'FEMALE' else 0
        
        # goal: DIET/BULK_UP -> 0/1 변환
        goal_numeric = 1 if db_user.goal == 'BULK_UP' else 0
        
        # InBody 데이터 생성
        inbody = InBodyData(
            score=db_user.inbody_score or 70.0,
            weight=db_user.weight or 70.0,
            muscle_mass=db_user.skeletal_muscle_mass or 30.0,
            fat_mass=db_user.body_fat_mass or 15.0,
            height=db_user.height or 170.0,
            fat_rate=db_user.body_fat_percentage or 20.0,
            r_arm=db_user.right_arm_muscle or 100.0,
            l_arm=db_user.left_arm_muscle or 100.0,
            trunk=db_user.trunk_muscle or 100.0,
            r_leg=db_user.right_leg_muscle or 100.0,
            l_leg=db_user.left_leg_muscle or 100.0
        )
        
        ai_user = User(
            db_user.user.id, 
            db_user.user.username, 
            gender_numeric, 
            goal_numeric, 
            inbody
        )
        
        # body_part: UPPER=0, LOWER=1, 나머지=2로 변환
        main_part = 0 if db_equip.body_part == 'UPPER' else (1 if db_equip.body_part == 'LOWER' else 2)
        
        # subcategory를 sub_part로 사용 (없으면 body_part 사용)
        sub_part = db_equip.subcategory or db_equip.body_part or 'ETC'
        
        ai_equip = TimeAIEquipment(
            db_equip.id, 
            db_equip.name, 
            main_part, 
            sub_part
        )
        
        return ai_user, ai_equip

    def generate_routine(self, user_id, target_parts, total_time_limit):
        """
        [루틴 생성 로직]
        1. Routine AI: 기구별 예상 별점 예측 -> 정렬
        2. Time AI: 기구별 적정 시간 계산
        3. 조합: 시간 제한 내에서 별점 높은 순으로 담기
        
        target_parts: subcategory 또는 body_part 리스트
        예: ["CHEST_PRESS_MAIN", "BACK_PULL_VERTICAL"] 또는 ["UPPER", "LOWER"]
        """
        from django.contrib.auth.models import User
        user = User.objects.get(id=user_id)
        user_profile = user.userprofile
        
        # 1. 사용자가 선택한 부위에 해당하는 기구들 조회
        # subcategory 또는 body_part로 필터링
        candidates = Equipment.objects.filter(
            Q(subcategory__in=target_parts) | Q(body_part__in=target_parts)
        ).filter(gym=user_profile.gym if hasattr(user_profile, 'gym') else None)
        
        # gym 정보가 없으면 모든 기구 대상
        if not candidates.exists():
            candidates = Equipment.objects.filter(
                Q(subcategory__in=target_parts) | Q(body_part__in=target_parts)
            )
        
        scored_candidates = []
        
        for eq in candidates:
            # (1) 루틴 AI에게 물어봄: "이거 추천하면 몇 점 받을까?"
            predicted_star = routine_ai_engine.predict_satisfaction(user_profile, eq)
            
            # (2) 시간 AI에게 물어봄: "이거 시키면 몇 분이나 해야 할까?"
            ai_user, ai_equip = self._to_time_ai_format(user_profile, eq)
            predicted_time = time_ai_engine.predict_time(ai_user, ai_equip)
            
            scored_candidates.append({
                'equipment': eq,
                'star_score': predicted_star, # 예상 별점
                'time_minutes': predicted_time # 추천 시간
            })
            
        # 2. 예상 별점이 높은 순서대로 정렬 (Ranking)
        scored_candidates.sort(key=lambda x: x['star_score'], reverse=True)
        
        # 3. 사용자의 총 시간(예: 60분)에 맞춰서 상위 기구 담기
        final_routine = []
        current_time = 0
        
        for item in scored_candidates:
            if current_time + item['time_minutes'] <= total_time_limit:
                final_routine.append({
                    "id": item['equipment'].id,
                    "name": item['equipment'].name,
                    "body_part": item['equipment'].body_part,
                    "subcategory": item['equipment'].subcategory,
                    "predicted_star": round(item['star_score'], 1), # UI 표시용
                    "time_minutes": round(item['time_minutes'], 0)  # UI 표시용
                })
                current_time += item['time_minutes']
            
            if len(final_routine) >= 6: # 최대 6개까지만 추천
                break
                
        return final_routine

    def submit_feedback(self, user_id, equip_id, time_rating, star_rating):
        """
        [피드백 학습 로직] 
        사용자의 두 가지 피드백을 각각의 AI에게 전달하여 학습시킴
        """
        from django.contrib.auth.models import User
        user = User.objects.get(id=user_id)
        user_profile = user.userprofile
        equipment = Equipment.objects.get(id=equip_id)
        
        # 1. 루틴 AI 학습 (별점 피드백 사용)
        # "이 기구가 맘에 들었니?" -> 1~5점
        rank_loss = routine_ai_engine.train_routine(user_profile, equipment, star_rating)
        
        # 2. 시간 AI 학습 (시간 평가 피드백 사용)
        # (3.png 화면) "이용시간이 적절했니?" -> 1:부족 ~ 5:과도
        ai_user, ai_equip = self._to_time_ai_format(user_profile, equipment)
        
        # 현재 추천되었던 시간을 다시 계산해서 기준점으로 잡음
        current_rec_time = time_ai_engine.predict_time(ai_user, ai_equip)
        
        # 학습 진행 (update_with_feedback 함수 호출)
        target_time, time_loss = time_ai_engine.update_with_feedback(
            ai_user, ai_equip, current_rec_time, time_rating
        )
        
        return rank_loss, time_loss