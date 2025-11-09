from django.shortcuts import render
# gyms/views.py

from rest_framework import viewsets, status
# IsAuthenticated를 import 합니다.
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Gym, GymMembership
from .serializers import GymSerializer, GymMembershipSerializer, MyGymSerializer

class GymViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated] # <- 이 줄 추가
    queryset = Gym.objects.all()
    serializer_class = GymSerializer
    
    @action(detail=False, methods=['get', 'post'], url_path='my-gym')
    def my_gym(self, request):
        """
        내 헬스장에 가입/조회하기
        GET: 내가 가입한 헬스장의 정보 조회 (가입 안 했으면 404)
        POST: 특정 헬스장에 가입 요청 (Request Body에 gym_id 필요)
        """
        user = request.user
        
        if request.method == 'GET':
            # 내가 가입한 헬스장 조회
            try:
                membership = GymMembership.objects.get(user=user, status='APPROVED')
                serializer = MyGymSerializer(membership)
                return Response(serializer.data, status=status.HTTP_200_OK)
            except GymMembership.DoesNotExist:
                return Response(
                    {'error': '가입된 헬스장이 없습니다.'}, 
                    status=status.HTTP_404_NOT_FOUND
                )
        
        elif request.method == 'POST':
            # 특정 헬스장에 가입 요청
            gym_id = request.data.get('gym_id')
            
            if not gym_id:
                return Response(
                    {'error': 'gym_id가 필요합니다.'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            try:
                gym = Gym.objects.get(id=gym_id)
            except Gym.DoesNotExist:
                return Response(
                    {'error': '해당 헬스장을 찾을 수 없습니다.'}, 
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # 이미 가입되어 있는지 확인
            existing_membership = GymMembership.objects.filter(user=user, gym=gym).first()
            if existing_membership:
                if existing_membership.status == 'APPROVED':
                    return Response(
                        {'error': '이미 가입된 헬스장입니다.'}, 
                        status=status.HTTP_400_BAD_REQUEST
                    )
                elif existing_membership.status == 'PENDING':
                    return Response(
                        {'error': '이미 가입 신청 중입니다.'}, 
                        status=status.HTTP_400_BAD_REQUEST
                    )
            
            # 새 회원권 생성
            membership = GymMembership.objects.create(
                user=user,
                gym=gym,
                status='PENDING'
            )
            
            serializer = MyGymSerializer(membership)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

class GymMembershipViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated] # <- 이 줄 추가
    queryset = GymMembership.objects.all()
    serializer_class = GymMembershipSerializer