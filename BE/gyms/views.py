from django.shortcuts import render
# gyms/views.py

from rest_framework import viewsets
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