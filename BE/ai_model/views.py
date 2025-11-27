from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.apps import apps
from django.shortcuts import get_object_or_404

# Django DB 모델들 (경로가 맞는지 확인 필요)
from equipment.models import Equipment
from users.models import UserProfile # 혹은 사용하는 유저 모델

# AI 데이터 포맷용 클래스
from .time_ai import User as AIUser, InBodyData, Equipment as AIEquipment

class BaseAIView(APIView):
    """
    공통 기능을 담은 부모 클래스
    """
    def get_ai_engines(self):
        # apps.py에서 초기화된 AI 엔진 가져오기
        app_config = apps.get_app_config('ai_model')
        return app_config.time_ai_engine, app_config.routine_ai_engine

    def convert_to_ai_user(self, db_user):
        """Django User DB 객체를 -> AI User 객체로 변환"""
        # 예시: UserProfile 모델에 inbody 정보가 있다고 가정
        # 실제 모델 필드명에 맞춰 수정해주세요!
        try:
            profile = db_user.profile 
            inbody = InBodyData(
                score=profile.inbody_score,
                weight=profile.weight,
                muscle_mass=profile.skeletal_muscle_mass,
                fat_mass=profile.body_fat_mass,
                height=profile.height,
                fat_rate=profile.body_fat_percent,
                r_arm=profile.seg_muscle_ra,
                l_arm=profile.seg_muscle_la,
                trunk=profile.seg_muscle_trunk,
                r_leg=profile.seg_muscle_rl,
                l_leg=profile.seg_muscle_ll
            )
            return AIUser(
                user_id=db_user.id,
                name=db_user.username,
                gender=0 if profile.gender == 'Male' else 1,
                goal=0 if profile.goal == 'DIET' else 1,
                inbody_data=inbody
            )
        except Exception as e:
            print(f"User 변환 에러: {e}")
            return None # 에러 처리 필요

# =========================================================
# 1. 루틴 생성 API
# URL: POST /api/ai/routine/
# Body: { "parts": ["가슴", "등"], "intensity": "상", "mode": "AVAILABLE_ONLY" }
# =========================================================
class RoutineGenerateView(BaseAIView):
    def post(self, request):
        time_engine, routine_engine = self.get_ai_engines()
        
        # 1. 파라미터 받기
        target_parts = request.data.get('parts', [])
        intensity = request.data.get('intensity', '중')
        mode = request.data.get('mode', 'ALL') # 'AVAILABLE_ONLY'

        # 2. 유저 변환
        ai_user = self.convert_to_ai_user(request.user)
        if not ai_user:
            return Response({"error": "인바디 정보가 없습니다."}, status=400)

        # 3. 현재 헬스장 기구 점유 상태 가져오기 (실시간성)
        # 예: Equipment 모델에 is_occupied 필드가 있다고 가정
        all_eq = Equipment.objects.all()
        current_occupancy = {eq.id: eq.is_occupied for eq in all_eq}

        # 4. AI 루틴 생성 실행
        routine_result = routine_engine.generate_routine(
            ai_user, target_parts, intensity, mode, current_occupancy
        )

        # 5. 결과 JSON 변환
        data = []
        total_time = 0
        for item in routine_result:
            eq = item['equipment'] # AI용 Equipment 객체 (혹은 DB 객체)
            data.append({
                "id": eq.equip_id if hasattr(eq, 'equip_id') else eq.id,
                "name": eq.name,
                "time": round(item['time'], 1),
                "wait_time": item['wait_time'],
                "img": getattr(eq, 'image_url', '') # 이미지가 있다면
            })
            total_time += item['time']

        return Response({
            "summary": {
                "total_time": int(total_time),
                "count": len(data)
            },
            "routine": data
        })

# =========================================================
# 2. 이용 시간 예측 API (NFC 태깅 시)
# URL: POST /api/ai/time/
# Body: { "equipment_id": 3 }
# =========================================================
class TimePredictionView(BaseAIView):
    def post(self, request):
        time_engine, _ = self.get_ai_engines()
        
        equip_id = request.data.get('equipment_id')
        db_equip = get_object_or_404(Equipment, pk=equip_id)

        ai_user = self.convert_to_ai_user(request.user)
        
        # DB 기구 -> AI 기구 객체 변환 (간단히 매핑)
        # routine_ai.py의 _get_equip_tensor가 DB객체를 처리하도록 짰으므로
        # 여기서는 DB객체를 그대로 넘겨도 time_ai가 속성을 읽을 수 있게 맞춰야 함
        # 편의상 여기서도 간단한 AIEquipment로 변환해서 넘기는게 안전함
        ai_equip = AIEquipment(
            equip_id=db_equip.id,
            name=db_equip.name,
            main_part=0 if db_equip.body_part == 'UPPER' else 1, # 예시 로직
            sub_part=db_equip.subcategory
        )

        recommended_time = time_engine.predict_time(ai_user, ai_equip)

        return Response({
            "equipment": db_equip.name,
            "recommended_time": round(recommended_time, 1)
        })

# =========================================================
# 3. 피드백 반영 API (학습)
# URL: POST /api/ai/feedback/
# Body: { "type": "TIME", "equipment_id": 3, "score": 2, "used_time": 15 }
# Body: { "type": "ROUTINE", "routine_ids": [1,2,3], "score": 5 }
# =========================================================
class FeedbackView(BaseAIView):
    def post(self, request):
        time_engine, routine_engine = self.get_ai_engines()
        ai_user = self.convert_to_ai_user(request.user)
        
        fb_type = request.data.get('type') # 'TIME' or 'ROUTINE'
        score = float(request.data.get('score', 3))

        if fb_type == 'TIME':
            # 시간 AI 학습
            equip_id = request.data.get('equipment_id')
            used_time = float(request.data.get('used_time')) # 추천받았던 시간
            
            # DB 객체 가져오기 & AI 객체 변환
            db_eq = get_object_or_404(Equipment, pk=equip_id)
            ai_eq = AIEquipment(db_eq.id, db_eq.name, 0, db_eq.subcategory) # 간소화

            target, loss = time_engine.update_with_feedback(ai_user, ai_eq, used_time, score)
            
            # (옵션) 체크포인트 저장
            time_engine.save_checkpoint("time_ai.pth")
            
            return Response({"msg": "시간 AI 학습 완료", "loss": loss})

        elif fb_type == 'ROUTINE':
            # 루틴 AI 학습
            routine_ids = request.data.get('routine_ids', []) # 기구 ID 리스트
            
            # ID 리스트를 Equipment 객체 리스트로 변환
            routine_objs = list(Equipment.objects.filter(id__in=routine_ids))
            
            loss = routine_engine.learn_from_feedback(ai_user, routine_objs, score)
            
            # (옵션) 체크포인트 저장
            routine_engine.save_checkpoint("routine_ai.pth")

            return Response({"msg": "루틴 AI 학습 완료", "loss": loss})

        return Response({"error": "Invalid Type"}, status=400)