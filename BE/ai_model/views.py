from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.apps import apps
from django.shortcuts import get_object_or_404

# Django DB 모델들 (경로가 맞는지 확인 필요)
from equipment.models import Equipment
from users.models import User
# AI 데이터 포맷용 클래스
from .time_ai import User as AIUser, InBodyData, Equipment as AIEquipment

class BaseAIView(APIView):
    """
    공통 기능을 담은 부모 클래스
    """
    def get_ai_engines(self):
        # apps.py에서 초기화된 AI 엔진 가져오기
        app_config = apps.get_app_config('ai_model')
        time_engine = getattr(app_config, 'time_ai_engine', None)
        routine_engine = getattr(app_config, 'routine_ai_engine', None)

        # 서버가 gunicorn 등으로 실행될 때 apps.ready()에서 초기화되지 않을 수 있으므로
        # 런타임에 lazy하게 초기화를 시도합니다.
        if time_engine is None or routine_engine is None:
            try:
                from .time_ai import AIEngine
                from .routine_ai import RoutineAIEngine
                from equipment.models import Equipment

                if time_engine is None:
                    time_engine = AIEngine()
                    try:
                        time_engine.load_checkpoint("time_ai_checkpoint.pth")
                    except Exception:
                        pass
                    if not getattr(time_engine, 'is_trained', False):
                        # 간단한 전처리/사전학습
                        time_engine.pretrain_with_formula()
                    app_config.time_ai_engine = time_engine

                if routine_engine is None:
                    db_equipments = list(Equipment.objects.all())
                    routine_engine = RoutineAIEngine(db_equipments, time_ai_engine=time_engine)
                    try:
                        routine_engine.load_checkpoint("routine_ai_checkpoint.pth")
                    except Exception:
                        pass
                    app_config.routine_ai_engine = routine_engine

            except Exception as e:
                import logging
                logging.exception(f"AI engine lazy init failed: {e}")
                return None, None

        return time_engine, routine_engine

    def convert_to_ai_user(self, db_user):
        """Django User DB 객체를 -> AI User 객체로 변환"""
        # 예시: UserProfile 모델에 inbody 정보가 있다고 가정
        # 실제 모델 필드명에 맞춰 수정해주세요!
        try:
            # 안전하게 UserProfile을 가져오기 (related name: userprofile)
            profile = getattr(db_user, 'userprofile', None)
            if profile is None:
                # no profile -> cannot build AI user
                return None

            # Map DB field names to AI InBodyData expected fields.
            # Use fallback numeric 0.0 for missing numeric fields to avoid exceptions.
            def n(v):
                try:
                    return float(v) if v is not None else 0.0
                except Exception:
                    return 0.0

            inbody = InBodyData(
                score=n(getattr(profile, 'inbody_score', None)),
                weight=n(getattr(profile, 'weight_kg', None)),
                muscle_mass=n(getattr(profile, 'skeletal_muscle_mass_kg', None)),
                fat_mass=n(getattr(profile, 'body_fat_mass_kg', None)),
                height=n(getattr(profile, 'height_cm', None)),
                fat_rate=n(getattr(profile, 'body_fat_percentage', None)),
                r_arm=n(getattr(profile, 'segment_right_arm_percent', None)),
                l_arm=n(getattr(profile, 'segment_left_arm_percent', None)),
                trunk=n(getattr(profile, 'segment_trunk_percent', None)),
                r_leg=n(getattr(profile, 'segment_right_leg_percent', None)),
                l_leg=n(getattr(profile, 'segment_left_leg_percent', None))
            )

            # gender: normalize a few common representations
            gender_raw = (getattr(profile, 'gender', '') or '').strip()
            gender_num = 0 if gender_raw.lower().startswith('m') or gender_raw in ['0', 0] else 1

            # goal mapping: DIET -> 0, else MUSCLE_GAIN -> 1 (fallback to 1)
            goal_raw = (getattr(profile, 'exercise_goal', '') or '').upper()
            goal_num = 0 if goal_raw == 'DIET' else 1

            return AIUser(
                user_id=db_user.id,
                name=db_user.username,
                gender=gender_num,
                goal=goal_num,
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
        if time_engine is None or routine_engine is None:
            return Response({"error": "AI engine is not available on server. Check logs."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        # 1. 파라미터 받기
        target_parts = request.data.get('parts', [])
        intensity = request.data.get('intensity', '중')
        mode = request.data.get('mode', 'ALL') # 'AVAILABLE_ONLY'

        # [Sync] 다른 워커에서 학습된 최신 가중치 로드
        try:
            routine_engine.load_checkpoint("routine_ai_checkpoint.pth")
        except Exception:
            pass

        try:
            time_engine.load_checkpoint("time_ai_checkpoint.pth")
        except Exception:
            pass

        # 2. 유저 변환
        ai_user = self.convert_to_ai_user(request.user)
        if not ai_user:
            return Response({"error": "인바디 정보가 없습니다."}, status=400)

        # 3. 현재 헬스장 기구 점유 상태 가져오기 (실시간성)
        # Equipment 모델에는 is_occupied 필드가 없고 status/operational_state로 표현됩니다.
        # 점유로 간주: status가 IN_USE 또는 WAITING이거나, 운영 상태가 정상(NORMAL)이 아닌 경우.
        all_eq = list(Equipment.objects.all())
        
        # [Fix] AI 엔진의 기구 리스트를 최신 DB 상태로 동기화
        # (서버 실행 중 기구 정보가 변경되었을 수 있으므로 매 요청마다 갱신)
        routine_engine.update_equipments_list(all_eq)

        def is_occupied(eq):
            try:
                status_val = getattr(eq, 'status', 'AVAILABLE') or 'AVAILABLE'
                operational = getattr(eq, 'operational_state', 'NORMAL') or 'NORMAL'
                return (status_val in ['IN_USE', 'WAITING']) or (operational != 'NORMAL')
            except Exception:
                return False
        current_occupancy = {eq.id: is_occupied(eq) for eq in all_eq}

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
        if time_engine is None:
            return Response({"error": "Time AI engine is not available on server. Check logs."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        # [Sync] 최신 학습 가중치 로드
        try:
            time_engine.load_checkpoint("time_ai_checkpoint.pth")
        except Exception:
            pass
        
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
            main_part=1 if db_equip.body_part == 'LOWER' else 0, # Serializer와 동일 로직
            sub_part=db_equip.subcategory,
            equip_type=db_equip.type # 기구 유형 전달 (CARDIO, MACHINE 등)
        )

        if ai_user:
            try:
                recommended_time = time_engine.predict_time(ai_user, ai_equip)
                
                # 예측 정보 가져오기 (유사 사용자 정보 포함)
                pred_info = getattr(time_engine, 'last_prediction_info', {})
                had_similar_users = pred_info.get('had_similar_users', False)
                formula_time = pred_info.get('formula_time', recommended_time)
                
                print(f"🤖 [TimeAI] User={request.user.username}, Equip={db_equip.name}, Type={db_equip.type}")
                print(f"   └─ Formula={formula_time:.1f}분, Final={recommended_time:.1f}분, SimilarUsers={had_similar_users}")
            except Exception as e:
                print(f"⚠️ [TimeAI] Prediction failed: {e}")
                import traceback
                traceback.print_exc()
                # AI 예측 실패 시, 공식(Formula) 엔진으로 백업 계산 시도
                try:
                    recommended_time = time_engine.formula_engine.calculate_time(ai_user, ai_equip)
                    print(f"🔄 [TimeAI] Fallback to Formula: {recommended_time}")
                except Exception as e2:
                    print(f"⚠️ [TimeAI] Formula fallback failed: {e2}")
                    recommended_time = 15.0
        else:
            print(f"⚠️ [TimeAI] No AI User (Profile missing?), using base time.")
            recommended_time = 15.0

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
        try:
            time_engine, routine_engine = self.get_ai_engines()
            if time_engine is None or routine_engine is None:
                return Response({"error": "AI engines are not available on server. Check logs."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
            ai_user = self.convert_to_ai_user(request.user)
            if not ai_user:
                # UserProfile이 없는 경우 - 피드백 무시하고 200 반환
                return Response({"msg": "피드백 수신 완료 (프로필 없음 - 학습 생략)"}, status=status.HTTP_200_OK)
            
            fb_type = request.data.get('type') # 'TIME' or 'ROUTINE'
            score = float(request.data.get('score', 3))

            if fb_type == 'TIME':
                # 시간 AI 학습
                equip_id = request.data.get('equipment_id')
                used_time = float(request.data.get('used_time', 0))
                allocated_time = float(request.data.get('allocated_time', 0))
                
                # [중요] 테스트 시 짧은 사용 시간으로 인한 학습 오류 방지 로직
                # 사용자가 "부족하다(1,2)"고 했는데 사용 시간이 1분 미만이면, 
                # 실제 사용 시간이 아니라 '원래 할당받았던 시간'을 기준으로 학습해야 함.
                
                if score <= 2: # 부족함 (1, 2)
                    # 부족하다고 느꼈다면, 할당된 시간이 기준이 되어야 함
                    # (단, 할당 시간이 없으면 최소 15분으로 가정)
                    base_time = allocated_time if allocated_time > 0 else max(used_time, 15.0)
                elif score >= 4: # 과도함 (4, 5)
                    # 과도하다고 느꼈다면, 실제 사용 시간(일찍 끝냄)이 기준
                    base_time = used_time if used_time > 0 else allocated_time
                else: # 적절함 (3)
                    # 적절했다면 실제 사용 시간 기준 (단, 너무 짧으면 할당 시간)
                    base_time = used_time if used_time > 3.0 else allocated_time

                # 안전장치: 최종 base_time이 너무 작으면 보정
                if base_time < 3.0: base_time = 15.0

                # DB 객체 가져오기 & AI 객체 변환
                db_eq = get_object_or_404(Equipment, pk=equip_id)
                ai_eq = AIEquipment(
                    equip_id=db_eq.id, 
                    name=db_eq.name, 
                    main_part=1 if db_eq.body_part == 'LOWER' else 0, 
                    sub_part=db_eq.subcategory,
                    equip_type=db_eq.type
                )

                target, loss = time_engine.update_with_feedback(ai_user, ai_eq, base_time, score)
                
                # (옵션) 체크포인트 저장
                time_engine.save_checkpoint("time_ai_checkpoint.pth")
                
                return Response({"msg": "시간 AI 학습 완료", "loss": loss})

            elif fb_type == 'ROUTINE':
                # 루틴 AI 학습
                routine_ids = request.data.get('routine_ids', []) # 기구 ID 리스트
                equipment_ratings = request.data.get('equipment_ratings', {}) # {eq_id: rating}
                
                learned_count = 0
                
                # [신규] 개별 기구별 피드백이 있으면 개별 학습
                if equipment_ratings:
                    # 키를 정수로 변환 (JSON은 문자열 키만 지원하므로)
                    ratings_int = {int(k): float(v) for k, v in equipment_ratings.items()}
                    
                    # AI 엔진에 기구 리스트 갱신
                    all_eq = list(Equipment.objects.all())
                    routine_engine.update_equipments_list(all_eq)
                    
                    # 개별 피드백 학습
                    learned_count = routine_engine.learn_from_individual_feedback(ai_user, ratings_int)
                    
                    # 체크포인트 저장
                    if learned_count > 0:
                        routine_engine.save_checkpoint("routine_ai_checkpoint.pth")
                    
                    return Response({
                        "msg": f"개별 피드백 학습 완료 ({learned_count}개 기구)",
                        "learned_count": learned_count
                    })
                
                # [기존] 평균 점수 기반 학습 (하위 호환)
                if not routine_ids:
                    return Response({"msg": "피드백 수신 완료 (routine_ids 없음 - 학습 생략)"}, status=status.HTTP_200_OK)
                
                # ID 리스트를 Equipment 객체 리스트로 변환
                routine_objs = list(Equipment.objects.filter(id__in=routine_ids))
                
                if not routine_objs:
                    return Response({"msg": "피드백 수신 완료 (기구 없음 - 학습 생략)"}, status=status.HTTP_200_OK)
                
                loss = routine_engine.learn_from_feedback(ai_user, routine_objs, score)
                
                # (옵션) 체크포인트 저장
                routine_engine.save_checkpoint("routine_ai_checkpoint.pth")

                return Response({"msg": "루틴 AI 학습 완료", "loss": loss})

            return Response({"error": "Invalid Type"}, status=400)
            
        except Exception as e:
            import logging
            logging.exception(f"FeedbackView error: {e}")
            # 500 대신 200으로 반환하여 프론트엔드 오류 방지
            return Response({"msg": "피드백 수신 완료 (학습 중 오류 발생)", "error": str(e)}, status=status.HTTP_200_OK)

# =========================================================
# 4. 전체 기구 이용 시간 예측 API (목록 조회용)
# URL: GET /api/ai/times/
# =========================================================
class AllTimePredictionView(BaseAIView):
    def get(self, request):
        time_engine, _ = self.get_ai_engines()
        
        # 엔진이 없거나 유저 프로필이 없으면 빈 딕셔너리 반환 (프론트엔드 기본값 사용)
        if time_engine is None:
            return Response({"times": {}})

        # [Sync] 최신 학습 가중치 로드
        try:
            time_engine.load_checkpoint("time_ai_checkpoint.pth")
        except Exception:
            pass
            
        ai_user = self.convert_to_ai_user(request.user)
        if not ai_user:
            return Response({"times": {}})

        all_eq = Equipment.objects.all()
        times = {}
        
        for db_equip in all_eq:
            try:
                # DB 기구 -> AI 기구 객체 변환
                ai_equip = AIEquipment(
                    equip_id=db_equip.id,
                    name=db_equip.name,
                    main_part=1 if db_equip.body_part == 'LOWER' else 0,
                    sub_part=db_equip.subcategory or "General",
                    equip_type=db_equip.type
                )
                
                # 예측 실행
                pred_time = time_engine.predict_time(ai_user, ai_equip)
                times[db_equip.id] = round(pred_time, 1)
            except Exception as e:
                print(f"⚠️ [AllTimePrediction] Failed for {db_equip.name}: {e}")
                # AI 실패 시 공식으로 백업
                try:
                    fallback_time = time_engine.formula_engine.calculate_time(ai_user, ai_equip)
                    times[db_equip.id] = round(fallback_time, 1)
                except:
                    times[db_equip.id] = 15.0 # 최후의 수단
                
        return Response({"times": times})