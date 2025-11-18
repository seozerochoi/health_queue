from django.conf import settings
import os

# Lazy-loaded model reference
model = None

# Path to the saved model file
MODEL_PATH = os.path.join(settings.BASE_DIR, 'ai_model', 'saved_models', 'time_recommendation_model.keras')


def load_ai_model():
    """
    Load the AI model into the module-level `model` variable. This function
    performs the expensive tensorflow import and model load only when called.
    """
    global model
    try:
        import tensorflow as tf
    except Exception as e:
        print(f"!!! TensorFlow import failed: {e}")
        model = None
        return

    if os.path.exists(MODEL_PATH):
        try:
            model = tf.keras.models.load_model(MODEL_PATH)
            print("=" * 40)
            print("======= AI 추천 모델 로드 성공 =======")
            print(f"경로: {MODEL_PATH}")
            print("=" * 40)
        except Exception as e:
            print(f"!!! AI 모델 로드 실패: {e}")
            model = None
    else:
        print(f"!!! AI 모델 파일이 없습니다. (경로: {MODEL_PATH})")
        model = None


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

    # Attempt to lazy-load the model if not yet loaded
    if model is None:
        load_ai_model()

    if model is None:
        # 모델을 사용할 수 없으면 기본값 반환
        print("AI 모델이 로드되지 않아 기본 시간을 반환합니다.")
        return 15

    try:
        # Import heavier libs only when doing prediction
        import numpy as np
        import pandas as pd

        input_data = {
            'age': user_profile.age or 30,
            'gender': _map_gender(user_profile.gender),
            'height': user_profile.height_cm or 170,
            'weight': user_profile.weight_kg or 70,
            'goal': _map_goal(user_profile.fitness_goal),
            'career': _map_career(user_profile.experience_level),
            'upper_ratio': ratios['upper_ratio'],
            'lower_ratio': ratios['lower_ratio'],
            'machine': machine_id or 0,
        }

        model_input_df = pd.DataFrame([input_data])
        predicted_time = model.predict(model_input_df)

        predicted_minutes = float(predicted_time[0][0])
        final_time = np.clip(predicted_minutes, 5, 60)

        print(f"AI 추천 시간: {final_time:.1f} 분")
        return round(final_time)

    except Exception as e:
        print(f"!!! AI 예측 중 오류 발생: {e}")
        return 15