# ai_model/urls.py

from django.urls import path
from .views import RoutineGenerateView, TimePredictionView, BatchTimePredictionView, FeedbackView

app_name = 'ai_model'

urlpatterns = [
    # 1. 루틴 생성: POST /api/ai/routine/
    path('routine/', RoutineGenerateView.as_view(), name='routine_gen'),
    
    # 2-1. 일괄 이용 시간 예측: GET /api/ai/times/
    path('times/', BatchTimePredictionView.as_view(), name='batch_time_pred'),
    
    # 2. 이용 시간 예측: POST /api/ai/time/
    path('time/', TimePredictionView.as_view(), name='time_pred'),
    
    # 3. 피드백 및 학습: POST /api/ai/feedback/
    path('feedback/', FeedbackView.as_view(), name='feedback'),
]