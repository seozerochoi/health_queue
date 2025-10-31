from django.shortcuts import render
# equipment/views.py

from rest_framework import viewsets
# IsAuthenticated를 import 합니다.
from rest_framework.permissions import IsAuthenticated
from .models import Equipment
from .serializers import EquipmentSerializer

class EquipmentViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated] # <- 이 줄 추가
    queryset = Equipment.objects.all()
    serializer_class = EquipmentSerializer