from django.apps import AppConfig
import sys

class AiModelConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'ai_model'

    # 전역 변수로 AI 엔진들을 저장할 공간
    time_ai_engine = None
    routine_ai_engine = None

    def ready(self):
        """
        Django 서버가 시작될 때 실행되는 함수.
        여기서 AI 모델을 로드해야 학습 데이터가 유지됩니다.
        """
        # 마이그레이션이나 관리자 명령어 실행 시에는 로드하지 않음 (오류 방지)
        if 'runserver' not in sys.argv:
            return

        from .time_ai import AIEngine
        from .routine_ai import RoutineAIEngine
        from equipment.models import Equipment  # 실제 기구 모델 import 확인 필요
        
        print("🤖 [AI System] 모델 초기화 중...")

        # 1. 시간 예측 AI 로드
        self.time_ai_engine = AIEngine()
        # 저장된 가중치 파일이 있다면 로드 (파일이 없으면 내부적으로 예외처리됨)
        self.time_ai_engine.load_checkpoint("time_ai_checkpoint.pth") 
        if not self.time_ai_engine.is_trained:
            self.time_ai_engine.pretrain_with_formula()

        # 2. 루틴 추천 AI 로드
        # DB에서 최신 기구 목록 가져오기
        try:
            db_equipments = list(Equipment.objects.all())
            self.routine_ai_engine = RoutineAIEngine(db_equipments)
            self.routine_ai_engine.load_checkpoint("routine_ai_checkpoint.pth")
            print(f"✅ [AI System] 준비 완료! (기구 {len(db_equipments)}개 로드됨)")
        except Exception as e:
            print(f"⚠️ [AI System] 기구 데이터를 불러올 수 없습니다: {e}")