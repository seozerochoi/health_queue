from django.shortcuts import render
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from gyms.models import Equipment
from .services import predict_ideal_exercise_time

class IdealTimeAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, equipment_id):
        try:
            equipment = Equipment.objects.get(id=equipment_id)
        except Equipment.DoesNotExist:
            return Response({"error": "기구가 존재하지 않습니다."}, status=404)
            
        predicted_time = predict_ideal_exercise_time(request.user, equipment.category)
        
        return Response({
            "user": request.user.email,
            "equipment": equipment.name,
            "base_time": equipment.base_usage_time,
            "ai_recommended_time": predicted_time
        })