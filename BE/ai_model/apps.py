from django.apps import AppConfig
import sys
import os

class AiModelConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'ai_model'

    # 전역 변수로 AI 엔진들을 저장할 공간
    time_ai_engine = None
    routine_ai_engine = None
    _initialized = False  # 중복 초기화 방지

    def ready(self):
        """
        Django 서버가 시작될 때 실행되는 함수.
        여기서 AI 모델을 로드해야 학습 데이터가 유지됩니다.
        """
        # 중복 초기화 방지
        if AiModelConfig._initialized:
            return
        
        # 마이그레이션이나 특정 관리자 명령어 실행 시에는 로드하지 않음
        skip_commands = ['migrate', 'makemigrations', 'collectstatic', 'shell', 'dbshell', 'createsuperuser']
        if any(cmd in sys.argv for cmd in skip_commands):
            return
        
        # 환경 변수로 AI 초기화 건너뛰기 옵션 제공 (테스트용)
        if os.environ.get('SKIP_AI_INIT', '').lower() == 'true':
            print("⚠️ [AI System] SKIP_AI_INIT=true로 인해 AI 초기화 건너뜀")
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
            self.routine_ai_engine = RoutineAIEngine(db_equipments, time_ai_engine=self.time_ai_engine)
            self.routine_ai_engine.load_checkpoint("routine_ai_checkpoint.pth")
            print(f"✅ [AI System] 준비 완료! (기구 {len(db_equipments)}개 로드됨)")
            AiModelConfig._initialized = True  # 초기화 완료 플래그
        except Exception as e:
            print(f"⚠️ [AI System] 기구 데이터를 불러올 수 없습니다: {e}")