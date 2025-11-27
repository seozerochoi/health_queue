from rest_framework.views import APIView
from rest_framework.response import Response
from .services import SmartService

service = SmartService()

class RecommendRoutineView(APIView):
    def post(self, request):
        """
        (1.png) 화면에서 'AI 루틴 생성하기' 버튼을 눌렀을 때 호출
        """
        user_id = request.user.id
        target_parts = request.data.get('target_parts', []) # 예: ["Chest", "Back"]
        total_time = request.data.get('total_time', 60)     # 예: 60분
        
        routine = service.generate_routine(user_id, target_parts, total_time)
        
        return Response({
            "msg": "AI 맞춤 루틴 생성 완료",
            "routine": routine
        })

class FeedbackView(APIView):
    def post(self, request):
        """
        운동 종료 후 (3.png) 화면과 별점 화면에서 피드백 전송 시 호출
        Body: {
            "equipment_id": 1,
            "time_rating": 2,  # (3.png) 1:매우부족 ~ 5:매우과도 -> 시간 AI 학습용
            "star_rating": 5   # 기구 만족도 별점 1~5점 -> 루틴 AI 학습용
        }
        """
        user_id = request.user.id
        equip_id = request.data.get('equipment_id')
        
        # 두 개의 피드백을 분리해서 받음
        time_rating = int(request.data.get('time_rating')) 
        star_rating = float(request.data.get('star_rating'))
        
        # 서비스 레이어로 전달하여 각각 학습
        rank_loss, time_loss = service.submit_feedback(user_id, equip_id, time_rating, star_rating)
        
        return Response({
            "msg": "소중한 피드백 감사합니다! 두 개의 AI가 모두 똑똑해졌습니다.",
            "debug": {"rank_loss": rank_loss, "time_loss": time_loss}
        })