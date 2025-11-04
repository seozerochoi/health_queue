
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import Gym, GymMembership
from .serializers import GymSerializer, GymMembershipSerializer
from django.shortcuts import get_object_or_404

class GymViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Gym.objects.all()
    serializer_class = GymSerializer

    @action(detail=False, methods=['get', 'post'])
    def my_gym(self, request):
        if request.method == 'GET':
            try:
                membership = GymMembership.objects.get(user=request.user)
                return Response({
                    'id': membership.id,
                    'user': request.user.username,
                    'gym_name': membership.gym.name,
                    'gym_address': membership.gym.address,
                    'status': membership.status,
                    'join_date': membership.created_at
                })
            except GymMembership.DoesNotExist:
                return Response({'detail': 'No gym membership found'}, status=status.HTTP_404_NOT_FOUND)
        
        elif request.method == 'POST':
            gym_id = request.data.get('gym_id')
            if not gym_id:
                return Response({'detail': 'gym_id is required'}, status=status.HTTP_400_BAD_REQUEST)
            
            gym = get_object_or_404(Gym, id=gym_id)
            membership, created = GymMembership.objects.get_or_create(
                user=request.user,
                gym=gym,
                defaults={'status': 'APPROVED'}
            )
            
            return Response({
                'id': membership.id,
                'user': request.user.username,
                'gym_name': membership.gym.name,
                'gym_address': membership.gym.address,
                'status': membership.status,
                'join_date': membership.created_at
            }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

class GymMembershipViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = GymMembership.objects.all()
    serializer_class = GymMembershipSerializer