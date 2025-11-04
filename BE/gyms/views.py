from django.shortcuts import render
# gyms/views.py

from rest_framework import viewsets
from rest_framework.decorators import api_view
from rest_framework.response import Response
# IsAuthenticated를 import 합니다.
from rest_framework.permissions import IsAuthenticated
from .models import Gym, GymMembership
from .serializers import GymSerializer, GymMembershipSerializer

class GymViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated] # <- 이 줄 추가
    queryset = Gym.objects.all()
    serializer_class = GymSerializer

class GymMembershipViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated] # <- 이 줄 추가
    queryset = GymMembership.objects.all()
    serializer_class = GymMembershipSerializer

@api_view(['GET'])
def my_gym(request):
    """사용자의 헬스장 정보를 반환"""
    if not request.user.is_authenticated:
        return Response({"error": "Authentication required"}, status=401)
    
    try:
        # GymMembership에서 사용자의 헬스장 찾기
        membership = GymMembership.objects.filter(user=request.user).first()
        if membership:
            serializer = GymSerializer(membership.gym)
            return Response(serializer.data)
        else:
            return Response({"error": "No gym associated with this user"}, status=404)
    except Exception as e:
        return Response({"error": str(e)}, status=500)