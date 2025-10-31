from users.models import User

def predict_ideal_exercise_time(user: User, equipment_category: str):
    """
    사용자 프로필과 기구 종류에 따라 이상적인 운동 시간을 예측합니다.
    (현재는 실제 AI 모델 대신 규칙 기반의 시뮬레이션입니다.)
    """
    base_time = 15 # 기본 시간 15분
    
    # 예시 로직: 사용자의 매너 점수가 높으면 시간 추가
    if user.manner_score > 70:
        base_time += 5

    # 예시 로직: 기구 카테고리가 '유산소'이면 시간 추가
    if '유산소' in equipment_category:
        base_time += 10
        
    # 최종적으로 예측된 시간을 반환
    return base_time