from django.shortcuts import render
# users/views.py

from django.contrib.auth.models import User
from rest_framework import viewsets, generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView
from .serializers import UserSerializer, RegisterSerializer, UserProfileSerializer
from .models import UserProfile
from .ocr_service import InBodyOCRService
import logging
import base64

logger = logging.getLogger(__name__)

class UserViewSet(viewsets.ModelViewSet):
    # 이 줄을 추가하여 '출입증 검사'를 설정합니다.
    permission_classes = [IsAuthenticated]
    queryset = User.objects.all()
    serializer_class = UserSerializer

# RegisterView는 누구나 접근해야 하므로 수정하지 않습니다.
class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    permission_classes = (AllowAny,)
    serializer_class = RegisterSerializer

# 현재 로그인한 사용자 정보를 가져오는 View
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_current_user(request):
    serializer = UserSerializer(request.user)
    return Response(serializer.data)

# 현재 로그인한 사용자의 프로필 조회/수정
@api_view(['GET', 'PUT', 'PATCH'])
@permission_classes([IsAuthenticated])
def current_user_profile(request):
    try:
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
    except Exception as e:
        return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    if request.method in ['PUT', 'PATCH']:
        partial = request.method == 'PATCH'
        serializer = UserProfileSerializer(profile, data=request.data, partial=partial)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    # GET
    serializer = UserProfileSerializer(profile)
    return Response(serializer.data)

# JWT 토큰에 사용자 정보(role, username, name) 추가
class MyTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        
        # 토큰에 사용자 정보 추가
        token['username'] = user.username
        token['name'] = user.first_name or user.username
        
        # UserProfile에서 role 가져오기
        try:
            profile = user.userprofile
            token['role'] = profile.role
        except UserProfile.DoesNotExist:
            token['role'] = 'MEMBER'
        
        return token
    
    def validate(self, attrs):
        import sys
        data = super().validate(attrs)
        
        # 응답에 사용자 정보 추가 (id, username, name, role)
        data['id'] = self.user.id
        data['username'] = self.user.username
        data['name'] = self.user.first_name or self.user.username
        
        # UserProfile에서 role 가져오기 (없으면 자동 생성)
        try:
            profile = self.user.userprofile
            # is_staff와 profile.role이 일치하지 않으면 동기화
            expected_role = 'OPERATOR' if self.user.is_staff else 'MEMBER'
            if profile.role != expected_role:
                profile.role = expected_role
                profile.save()
                log_msg = f"[LOGIN SYNC] id={self.user.id} | username={self.user.username} | role updated to {expected_role}"
                print(log_msg, flush=True)
                sys.stdout.flush()
                logger.info(log_msg)
            
            data['role'] = profile.role
            
            # 로그 출력 (여러 방식 동시 사용)
            log_msg = f"[LOGIN SUCCESS] id={self.user.id} | username={self.user.username} | role={profile.role} | is_staff={self.user.is_staff} | is_superuser={self.user.is_superuser}"
            print(log_msg, flush=True)
            sys.stdout.flush()
            logger.info(log_msg)
            
        except UserProfile.DoesNotExist:
            # UserProfile이 없으면 is_staff 기반으로 생성
            role = 'OPERATOR' if self.user.is_staff else 'MEMBER'
            profile = UserProfile.objects.create(user=self.user, role=role)
            data['role'] = role
            
            # 로그 출력
            log_msg = f"[LOGIN AUTO-CREATE] id={self.user.id} | username={self.user.username} | created profile with role={role} | is_staff={self.user.is_staff}"
            print(log_msg, flush=True)
            sys.stdout.flush()
            logger.info(log_msg)
        
        # 최종 응답 로그
        response_log = f"[LOGIN RESPONSE] {data}"
        print(response_log, flush=True)
        sys.stdout.flush()
        logger.info(response_log)
        
        return data

class MyTokenObtainPairView(TokenObtainPairView):
    serializer_class = MyTokenObtainPairSerializer


# 인바디 이미지 업로드 및 OCR 처리
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def upload_inbody_image(request):
    """
    인바디 이미지를 업로드하고 AWS Rekognition으로 OCR 처리
    
    Request Body:
        - image: base64 인코딩된 이미지 문자열 또는 파일
        - auto_save: True일 경우 자동으로 프로필에 저장 (default: False)
    
    Returns:
        - data: 추출된 인바디 데이터
        - detected_texts: 감지된 모든 텍스트 (확인용)
    """
    try:
        # 프로필 가져오기 또는 생성
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        
        # 이미지 데이터 가져오기
        image_data = None
        
        # 1. base64 인코딩된 이미지인 경우
        if 'image' in request.data and isinstance(request.data['image'], str):
            image_str = request.data['image']
            # data:image/jpeg;base64, 접두사 제거
            if 'base64,' in image_str:
                image_str = image_str.split('base64,')[1]
            image_data = base64.b64decode(image_str)
        
        # 2. 파일 업로드인 경우
        elif 'image' in request.FILES:
            image_file = request.FILES['image']
            image_data = image_file.read()
        
        if not image_data:
            return Response(
                {'error': '이미지 데이터가 필요합니다.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # OCR 서비스 초기화 및 처리
        ocr_service = InBodyOCRService()
        result = ocr_service.process_inbody_image(image_data)
        
        # auto_save가 True이면 프로필에 자동 저장
        auto_save = request.data.get('auto_save', False)
        if auto_save and result['data']:
            for field_name, value in result['data'].items():
                if hasattr(profile, field_name):
                    setattr(profile, field_name, value)
            profile.save()
            
            return Response({
                'message': '인바디 데이터가 성공적으로 저장되었습니다.',
                'data': result['data'],
                'detected_texts': result['detected_texts']
            }, status=status.HTTP_200_OK)
        
        # auto_save가 False이면 데이터만 반환
        return Response({
            'message': 'OCR 처리가 완료되었습니다.',
            'data': result['data'],
            'detected_texts': result['detected_texts']
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"인바디 이미지 처리 오류: {str(e)}")
        return Response(
            {'error': f'이미지 처리 중 오류가 발생했습니다: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )