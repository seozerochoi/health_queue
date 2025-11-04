import tensorflow as tf
import numpy as np
import pandas as pd
from django.conf import settings
import os

# ==========================================================
# 1. 학습된 AI 모델 로드
# ==========================================================

# (3단계에서 생성될) AI 두뇌 파일의 경로를 지정합니다.
MODEL_PATH = os.path.join(settings.BASE_DIR, 'ai_model', 'saved_models', 'time_recommendation_model.keras')

def load_ai_model():
    """
    서버가 시작될 때 'settings.py'에 의해 호출될 함수입니다.
    AI 두뇌(.keras 파일)를 미리 메모리에 로드합니다.
    """
    global model # 전역 변수인 model을 수정할 수 있도록 함
    
    if os.path.exists(MODEL_PATH):
        try:
            # 학습된 AI 모델 파일을 불러옵니다.
            model = tf.keras.models.load_model(MODEL_PATH) 
            print("="*40)
            print(f"======= AI 추천 모델 로드 성공 =======")
            print(f"경로: {MODEL_PATH}")
            print("="*40)
        except Exception as e:
            print(f"!!! AI 모델 로드 실패: {e}")
            print("!!! 경고: AI 추천이 작동하지 않습니다.")
            model = None
    else:
        # 3단계(학습)를 아직 실행하지 않은 경우
        print(f"!!! AI 모델 파일이 없습니다. (경로: {MODEL_PATH})")
        print("!!! 'ai_model/training_script.py'를 실행하여 모델을 생성하세요.")


# ==========================================================
# 2. Django 데이터 -> AI 입력용 데이터로 변환 (전처리)
# (training_script.py의 데이터 생성 방식과 일치시킴)
# ==========================================================

def _map_gender(gender_str):
    """ '남성', '여성' 문자열을 0, 1 숫자로 변환 """
    return 1 if gender_str == '여성' else 0 # 0: 남성, 1: 여성

def _map_goal(goal_str):
    """ '근력 증가', '다이어트' 문자열을 0, 1 숫자로 변환 """
    # goal_str이 None일 수도 있으므로 체크
    return 1 if goal_str and ('다이어트' in goal_str or '체지방' in goal_str) else 0 # 0: 근력, 1: 다이어트

def _map_career(career_str):
    """ 'BEGINNER', 'INTERMEDIATE', 'ADVANCED'를 0, 1, 2 숫자로 변환 """
    if career_str == 'ADVANCED':
        return 2
    elif career_str == 'INTERMEDIATE':
        return 1
    else: # 'BEGINNER' 또는 None
        return 0 # 0: 초급

# ==========================================================
# 3. 백엔드(views.py)에서 호출할 메인 예측 함수
# ==========================================================

def get_ai_recommendation(user_profile, machine_id, ratios):
    """
    Django의 데이터를 AI 모델 입력에 맞게 변환하고 예측을 수행합니다.
    - user_profile: Django의 UserProfile 모델 인스턴스
    - machine_id: Equipment 모델의 ai_model_id (숫자)
    - ratios: {'upper_ratio': 0.x, 'lower_ratio': 0.y}
    """
    global model
    if model is None:
        # 모델 로드에 실패한 경우, AI 추천 대신 기본 시간(15분)을 반환
        print("AI 모델이 로드되지 않아 기본 시간을 반환합니다.")
        return 15  

    try:
        # 1. Django 데이터를 AI 모델 입력 형태(DataFrame)로 변환
        # training_script.py의 컬럼 순서와 정확히 일치해야 함:
        # 'age', 'gender', 'height', 'weight', 'goal', 'career', 
        # 'upper_ratio', 'lower_ratio', 'machine'
        
        input_data = {
            'age': user_profile.age or 30, # 정보가 없으면 기본값 30세
            'gender': _map_gender(user_profile.gender),
            'height': user_profile.height_cm or 170, # 기본값 170cm
            'weight': user_profile.weight_kg or 70, # 기본값 70kg
            'goal': _map_goal(user_profile.fitness_goal),
            'career': _map_career(user_profile.experience_level),
            'upper_ratio': ratios['upper_ratio'],
            'lower_ratio': ratios['lower_ratio'],
            'machine': machine_id or 0 # 정보가 없으면 기본값 0 (벤치프레스)
        }
        
        # 2. DataFrame 생성 및 예측
        # AI 모델은 2D 배열 형태의 입력을 기대하므로 [input_data] 리스트로 감쌉니다.
        model_input_df = pd.DataFrame([input_data])
        predicted_time = model.predict(model_input_df)
        
        # 3. 예측 결과(2D 배열)를 숫자 값으로 추출 및 범위 제한
        predicted_minutes = float(predicted_time[0][0])
        final_time = np.clip(predicted_minutes, 5, 60) # 5분~60분 사이로 보정
        
        print(f"AI 추천 시간: {final_time:.1f} 분")
        return round(final_time) # 소수점을 반올림한 정수(분)로 반환

    except Exception as e:
        print(f"!!! AI 예측 중 오류 발생: {e}")
        return 15 # 예측 중 오류 발생 시 기본값 15분 반환