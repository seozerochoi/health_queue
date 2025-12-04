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
from .models import UserProfile, InbodyRecord
from .serializers import InbodyRecordSerializer
import logging
import re
import boto3
from rest_framework.parsers import MultiPartParser
from rest_framework.views import APIView
from django.core.files.uploadedfile import InMemoryUploadedFile
from django.conf import settings
import base64
import json
import os
from django.core.files.base import ContentFile
try:
    from openai import OpenAI
except Exception:
    OpenAI = None

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


class InbodyAnalyzeView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]

    def post(self, request):
        # Expecting multipart/form-data with field 'image'
        image_file = request.FILES.get('image')
        if not image_file:
            return Response({'detail': 'No image provided'}, status=status.HTTP_400_BAD_REQUEST)

        # Read bytes
        if isinstance(image_file, InMemoryUploadedFile):
            img_bytes = image_file.read()
        else:
            img_bytes = image_file.file.read()

        # Try GPT Vision first (if OPENAI_API_KEY is configured); fallback to AWS Rekognition heuristic
        api_key = os.getenv('OPENAI_API_KEY') or getattr(settings, 'OPENAI_API_KEY', None)
        use_gpt = getattr(settings, 'INBODY_GPT_ENABLED', True)  # 기본값 True
        
        # INBODY_GPT_ENABLED=false면 바로 AWS Rekognition 사용
        if not use_gpt:
            logger.info("ℹ️ INBODY_GPT_ENABLED=false, AWS Rekognition으로 분석")
            # Skip GPT, go directly to Rekognition fallback below
        # INBODY_GPT_ENABLED=true면 GPT 우선 시도
        elif OpenAI and api_key:
            try:
                # 이미지 크기 최적화 (토큰 절약)
                from PIL import Image
                import io
                
                try:
                    img = Image.open(io.BytesIO(img_bytes))
                    
                    # 1. 흑백 변환 (컬러 정보 제거로 30-40% 토큰 절약)
                    if img.mode != 'L':
                        img = img.convert('L')
                        logger.info(f"🎨 이미지 흑백 변환: {img.mode}")
                    
                    # 2. 최대 크기 제한 (긴 쪽 기준 1024px)
                    max_size = 1024
                    if max(img.size) > max_size:
                        ratio = max_size / max(img.size)
                        new_size = tuple(int(dim * ratio) for dim in img.size)
                        img = img.resize(new_size, Image.Resampling.LANCZOS)
                    
                    # 3. WebP 포맷으로 저장 (JPEG보다 20-30% 효율적)
                    buffer = io.BytesIO()
                    img.save(buffer, format='WEBP', quality=80, method=6)
                    img_bytes_optimized = buffer.getvalue()
                    logger.info(f"📐 이미지 최적화: 원본 {len(img_bytes)} bytes → {len(img_bytes_optimized)} bytes ({100 - int(len(img_bytes_optimized)/len(img_bytes)*100)}% 절감)")
                    img_bytes = img_bytes_optimized
                except Exception as resize_error:
                    logger.warning(f"이미지 최적화 실패, 원본 사용: {resize_error}")
                
                b64 = base64.b64encode(img_bytes).decode('utf-8')
                client = OpenAI(api_key=api_key)

                system_prompt = (
                        "당신은 InBody 체성분 분석 결과지를 정확하게 파싱하는 전문가입니다.\n"
                        "InBody 270, 370, 570, 770 등 모든 모델을 지원하며, 한국어/영어 결과지를 처리합니다.\n\n"
                    
                        "=== InBody 결과지 레이아웃 구조 (추가 항목 포함) ===\n"
                        "1. 최상단/요약: 성별(Gender), 나이(Age), InBody Score 같은 요약 정보가 있을 수 있음\n"
                        "2. 상단: 신장(키) 정보 - 'cm' 단위로 표시됨\n"
                        "3. 중앙 좌측: '체성분분석' 또는 'Body Composition Analysis' 섹션\n"
                        "   - 첫 번째 항목: 체중 (Weight)\n"
                        "   - 두 번째 항목: 골격근량 (Skeletal Muscle Mass)\n"
                        "   - 세 번째 항목: 체지방량 (Body Fat Mass)\n"
                        "4. 세그멘탈 표 또는 표기(있으면): 우측/하단에 부위별 근육량(Right/Left Arm, Trunk, Right/Left Leg)\n"
                        "5. 우측 하단: '비만평가' 또는 'Obesity Evaluation' 섹션\n"
                        "   - 체지방률 (Body Fat Percentage) - '%' 기호 포함\n"
                        "   - BMI (Body Mass Index) - 'BMI' 레이블 근처\n\n"
                    
                        "=== 중요 규칙 ===\n"
                        "규칙 1: 괄호 안의 숫자는 '정상 범위'이므로 절대 추출하지 마세요\n"
                        "   예시: '59.1 (45.0-60.8)' → 59.1만 추출 (괄호 안 45.0, 60.8은 무시)\n"
                        "   예시: '체중 75.3 (52.1-70.9)' → 75.3만 추출\n\n"
                    
                        "규칙 2: '체성분분석' 섹션에서 항목 순서를 엄격히 지키세요\n"
                        "   1번째 = 체중 (가장 큰 값, 보통 30-200kg)\n"
                        "   2번째 = 골격근량 (중간 값, 보통 10-50kg, '골격근', 'Skeletal Muscle' 키워드)\n"
                        "   3번째 = 체지방량 (작은 값, 보통 3-80kg, '체지방', 'Body Fat' 키워드)\n\n"
                    
                        "규칙 3: '적정체중', '목표체중', '표준체중'은 추출하지 마세요 (체중과 혼동 방지)\n\n"
                    
                        "규칙 4: 체지방률(%)과 BMI는 '비만평가' 섹션에서만 추출하세요\n"
                        "   - 체지방률: '%' 기호가 있는 숫자 (5-65% 범위)\n"
                        "   - BMI: 'BMI' 레이블 근처의 숫자 (10-50 범위)\n\n"
                    
                        "규칙 5: 각 값의 유효 범위를 확인하세요\n"
                        "   - gender: 'Male' 또는 'Female' 문자열\n"
                        "   - age: 5-120 (년)\n"
                        "   - height_cm: 100-230\n"
                        "   - weight_kg: 30-200\n"
                        "   - inbody_score: 0-100 (있다면 정수로)\n"
                        "   - skeletal_muscle_mass_kg: 10-50\n"
                        "   - body_fat_mass_kg: 3-80\n"
                        "   - body_fat_percentage: 5-65\n"
                        "   - bmi: 10-50\n"
                        "   - segment_*_kg: 각 부위별 근육량 (0.5-20kg 범위)\n\n"
                    
                        "=== 출력 형식 ===\n"
                        "순수한 JSON 객체만 반환하세요. 설명이나 마크다운 없이 JSON만 출력하세요.\n"
                        '{"gender": 문자열 또는 null, "age": 숫자 또는 null, "height_cm": 숫자 또는 null, '
                        '"weight_kg": 숫자 또는 null, "inbody_score": 숫자 또는 null, '
                        '"skeletal_muscle_mass_kg": 숫자 또는 null, "body_fat_mass_kg": 숫자 또는 null, '
                        '"body_fat_percentage": 숫자 또는 null, "bmi": 숫자 또는 null, '
                        '"segment_right_arm_kg": 숫자 또는 null, "segment_left_arm_kg": 숫자 또는 null, '
                        '"segment_trunk_kg": 숫자 또는 null, "segment_right_leg_kg": 숫자 또는 null, '
                        '"segment_left_leg_kg": 숫자 또는 null}'
                )

                user_prompt = (
                        "이 InBody 결과지 이미지를 분석하여 가능한 모든 항목을 정확히 추출해주세요.\n\n"
                    
                        "📍 추출 단계별 가이드 (우선순위: 상단 요약 → 체성분 섹션 → 세그멘탈):\n\n"
                    
                        "1단계: 상단/요약에서 성별(gender)과 나이(age) 찾기\n"
                        "   - 예: 'Male', 'Female', '남성', '여성', 또는 '35 yrs', '35세' 같은 표기\n"
                        "   → gender는 'Male' 또는 'Female'로 표준화 시도, age는 정수(년)로 저장\n\n"
                    
                        "2단계: 상단에서 'InBody Score' 또는 'Score'를 찾기 (있다면)\n"
                        "   - 보통 0-100 범위의 정수\n"
                        "   → inbody_score에 저장\n\n"
                    
                        "3단계: 상단에서 신장(키) 찾기\n"
                        "   - 'cm' 단위가 붙은 숫자 (100-230cm 범위)\n"
                        "   - 키워드: '신장', 'Height', 'Ht'\n"
                        "   → height_cm에 저장\n\n"
                    
                        "4단계: '체성분분석' 섹션 찾기 (중앙 좌측)\n"
                        "   - 중앙 좌측 영역, '체성분분석' 또는 'Body Composition' 헤더\n"
                        "   - 3개의 측정값이 순서대로 나열됨\n\n"
                    
                        "5단계: 체성분분석의 첫 번째 값 = 체중\n"
                        "   - 가장 위에 있는 값 (보통 가장 큰 숫자)\n"
                        "   - 키워드: '체중', 'Weight', 'Wt'\n"
                        "   - 괄호 밖의 숫자만 추출! 예: '59.1 (45.0-60.8)' → 59.1\n"
                        "   - 30-200kg 범위\n"
                        "   → weight_kg에 저장\n\n"
                    
                        "6단계: 체성분분석의 두 번째 값 = 골격근량\n"
                        "   - 체중 바로 아래 값\n"
                        "   - 키워드: '골격근', 'Skeletal Muscle Mass', 'SMM'\n"
                        "   - 괄호 밖의 숫자만! 예: '25.8 (20.5-27.5)' → 25.8\n"
                        "   - 10-50kg 범위\n"
                        "   → skeletal_muscle_mass_kg에 저장\n\n"
                    
                        "7단계: 체성분분석의 세 번째 값 = 체지방량\n"
                        "   - 골격근량 바로 아래 값\n"
                        "   - 키워드: '체지방', 'Body Fat Mass', 'BFM'\n"
                        "   - 괄호 밖의 숫자만! 예: '18.2 (5.9-15.9)' → 18.2\n"
                        "   - 3-80kg 범위\n"
                        "   → body_fat_mass_kg에 저장\n\n"
                    
                        "8단계: '비만평가' 섹션에서 체지방률 찾기\n"
                        "   - 우측 하단 영역, '비만평가' 또는 'Obesity Evaluation' 섹션\n"
                        "   - '%' 기호가 붙은 숫자 (5-65% 범위)\n"
                        "   - 키워드: '체지방률', 'Body Fat Percentage', 'PBF'\n"
                        "   - 예: '36.2%' → 36.2 (% 기호 제거)\n"
                        "   → body_fat_percentage에 저장\n\n"
                    
                        "9단계: '비만평가' 섹션에서 BMI 찾기\n"
                        "   - 'BMI' 레이블 근처의 숫자 (10-50 범위)\n"
                        "   - 예: 'BMI 27.3' → 27.3\n"
                        "   → bmi에 저장\n\n"
                    
                        "10단계: 세그멘탈(부위별) 근육량 찾기 (가능하면)\n"
                        "   - 표기 예: 'Right Arm', 'Left Arm', 'Trunk', 'Right Leg', 'Left Leg'\n"
                        "   - 또는 한국어: '우측 팔', '좌측 팔', '몸통', '우측 다리', '좌측 다리'\n"
                        "   - InBody 770은 부위별 kg 표기가 있음. 없는 경우 null로 둡니다.\n"
                        "   - 각 부위: 0.5-20kg 범위\n"
                        "   → segment_right_arm_kg, segment_left_arm_kg, segment_trunk_kg,\n"
                        "      segment_right_leg_kg, segment_left_leg_kg에 저장\n\n"

                        "11단계: 세그멘탈(부위별) 근육량 비율(%) 찾기 (표준체중 대비)\n"
                        "   - kg 값 옆에 괄호나 그래프로 표시된 % 값 (예: 100%, 115%)\n"
                        "   - 보통 40-200% 범위\n"
                        "   → segment_right_arm_percent, segment_left_arm_percent, segment_trunk_percent,\n"
                        "      segment_right_leg_percent, segment_left_leg_percent에 저장\n\n"
                    
                        "⚠️ 주의사항:\n"
                        "- 괄호 안의 범위 값(정상 범위)은 절대 추출하지 마세요\n"
                        "- '적정체중', '목표체중'은 무시하세요\n"
                        "- 각 섹션을 명확히 구분하여 값을 찾으세요\n"
                        "- 순서가 중요합니다: 체중→골격근량→체지방량 순서를 지키세요\n"
                        "- 가능한 한 모든 항목을 채워주세요. 불확실하면 null로 표기하세요.\n\n"
                    
                        "출력 예시:\n"
                        '{"gender": "Male", "age": 35, "height_cm": 156.0, "weight_kg": 59.1, '
                        '"inbody_score": 85, "skeletal_muscle_mass_kg": 25.8, "body_fat_mass_kg": 18.2, '
                        '"body_fat_percentage": 36.2, "bmi": 27.3, '
                        '"segment_right_arm_kg": 2.5, "segment_left_arm_kg": 2.3, '
                        '"segment_trunk_kg": 10.2, "segment_right_leg_kg": 8.0, "segment_left_leg_kg": 7.9, '
                        '"segment_right_arm_percent": 100.0, "segment_left_arm_percent": 98.5, '
                        '"segment_trunk_percent": 105.2, "segment_right_leg_percent": 102.0, "segment_left_leg_percent": 101.5}\n\n'
                    
                        "이제 이미지를 분석하여 JSON만 반환해주세요:"
                )

                # Use Chat Completions with multimodal content (gpt-4o-mini)
                resp = client.chat.completions.create(
                    model=os.getenv('OPENAI_INBODY_MODEL', 'gpt-4o-mini'),
                    temperature=0,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": user_prompt},
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:image/webp;base64,{b64}",
                                        "detail": "high"  # InBody 결과지 텍스트 읽기에는 high detail 필요
                                    }
                                }
                            ],
                        },
                    ],
                )

                content = resp.choices[0].message.content if resp.choices else None
                if not content:
                    raise ValueError('Empty response from GPT')

                # Expect strict JSON; attempt to parse
                # If provider wraps in code fences, strip them
                text = content.strip()
                if text.startswith('```'):
                    text = text.strip('`')
                    # remove possible leading json
                    text = text.replace('json\n', '')
                data = json.loads(text)

                # Coerce to expected schema, allowing missing keys
                def to_num(x):
                    try:
                        return float(x) if x is not None else None
                    except Exception:
                        return None

                def to_str(x):
                    try:
                        return str(x) if x is not None else None
                    except Exception:
                        return None

                parsed = {
                    'gender': to_str(data.get('gender')),
                    'age': to_num(data.get('age')),
                    'height_cm': to_num(data.get('height_cm')),
                    'weight_kg': to_num(data.get('weight_kg')),
                    'inbody_score': to_num(data.get('inbody_score')),
                    'skeletal_muscle_mass_kg': to_num(data.get('skeletal_muscle_mass_kg')),
                    'body_fat_mass_kg': to_num(data.get('body_fat_mass_kg')),
                    'body_fat_percentage': to_num(data.get('body_fat_percentage')),
                    'bmi': to_num(data.get('bmi')),
                    'segment_right_arm_kg': to_num(data.get('segment_right_arm_kg')),
                    'segment_left_arm_kg': to_num(data.get('segment_left_arm_kg')),
                    'segment_trunk_kg': to_num(data.get('segment_trunk_kg')),
                    'segment_right_leg_kg': to_num(data.get('segment_right_leg_kg')),
                    'segment_left_leg_kg': to_num(data.get('segment_left_leg_kg')),
                    'segment_right_arm_percent': to_num(data.get('segment_right_arm_percent')),
                    'segment_left_arm_percent': to_num(data.get('segment_left_arm_percent')),
                    'segment_trunk_percent': to_num(data.get('segment_trunk_percent')),
                    'segment_right_leg_percent': to_num(data.get('segment_right_leg_percent')),
                    'segment_left_leg_percent': to_num(data.get('segment_left_leg_percent')),
                }

                # Persist image and parsed result
                filename = f"inbody_{request.user.id}.jpg"
                record = InbodyRecord(user=request.user, source='gpt', parsed=parsed)
                record.image.save(filename, ContentFile(img_bytes), save=True)

                # Update UserProfile with the new data
                try:
                    profile, _ = UserProfile.objects.get_or_create(user=request.user)
                    updated = False
                    for key, value in parsed.items():
                        if value is not None and hasattr(profile, key):
                            setattr(profile, key, value)
                            updated = True
                    if updated:
                        profile.save()
                        logger.info(f"Updated UserProfile for user {request.user.id} with InBody data (GPT)")
                except Exception as e:
                    logger.error(f"Failed to update UserProfile: {e}")

                return Response({
                    'source': 'gpt',
                    'parsed': parsed,
                    'record': {
                        'id': record.id,
                        'image_url': record.image.url,
                        'created_at': record.created_at.isoformat(),
                    }
                })

            except Exception as e:
                logger.exception('Inbody analyze via GPT failed; falling back to Rekognition')
                # GPT 실패 시 자동으로 AWS Rekognition으로 폴백
                logger.warning(f"⚠️ GPT Vision 실패 (크레딧 부족 또는 오류), AWS Rekognition으로 폴백: {str(e)}")
                # continue to Rekognition fallback below
        else:
            # GPT가 활성화되어 있지만 API 키가 없는 경우
            if use_gpt:
                logger.warning("⚠️ INBODY_GPT_ENABLED=true이지만 OPENAI_API_KEY가 없음, AWS Rekognition 사용")

        # Fallback: AWS Rekognition OCR + heuristics
        try:
            region = getattr(settings, 'AWS_REGION', None) or os.getenv('AWS_REGION') or os.getenv('AWS_DEFAULT_REGION')
            if not region:
                return Response({'detail': 'AWS_REGION is not configured. Set AWS_REGION or AWS_DEFAULT_REGION.'}, status=status.HTTP_400_BAD_REQUEST)
            rek = boto3.client('rekognition', region_name=region)
            resp = rek.detect_text(Image={'Bytes': img_bytes})

            detections = resp.get('TextDetections', []) or []
            items = []
            for d in detections:
                items.append({
                    'text': d.get('DetectedText', '').strip(),
                    'type': d.get('Type'),
                    'confidence': d.get('Confidence'),
                    'geometry': d.get('Geometry'),
                })

            def normalize_num_str(s: str) -> str:
                if not s:
                    return s
                s = s.replace('\uFF10', '0').replace('\uFF11', '1').replace('\uFF12', '2').replace('\uFF13', '3')
                s = s.replace('\uFF14', '4').replace('\uFF15', '5').replace('\uFF16', '6').replace('\uFF17', '7')
                s = s.replace('\uFF18', '8').replace('\uFF19', '9')
                s = s.replace(',', '').replace('\u2009', '').strip()
                return s

            def to_float(s: str):
                try:
                    s2 = normalize_num_str(s)
                    return float(s2)
                except Exception:
                    return None

            def find_number_in_text(text: str):
                if not text:
                    return None
                m = re.search(r"([0-9]+(?:[\.,][0-9]+)?)", text)
                if m:
                    return to_float(m.group(1))
                return None

            def find_by_keywords(keywords_regex_list, unit_hint=None):
                for idx, it in enumerate(items):
                    text = it['text']
                    for kw in keywords_regex_list:
                        if re.search(kw, text, re.IGNORECASE):
                            num = None
                            m = re.search(kw + r"[:\s]*([0-9]+(?:[\.,][0-9]+)?)", text, re.IGNORECASE)
                            if m:
                                num = to_float(m.group(1))
                            else:
                                num = find_number_in_text(text)
                            if num is not None:
                                return num
                            look = ' '.join([items[j]['text'] for j in range(idx, min(idx+3, len(items)))])
                            num = find_number_in_text(look)
                            if num is not None:
                                return num
                return None

            lines = [it['text'] for it in items if it.get('type') == 'LINE']
            concat = '\n'.join(lines)

            parsed = {}
            
            # Enhanced parsing with better context awareness
            def find_value_near_keyword(keyword_patterns, lines_list, default=None):
                """Find numeric value near keyword with better context handling"""
                for i, line in enumerate(lines_list):
                    line_lower = line.lower()
                    for pattern in keyword_patterns:
                        if re.search(pattern, line_lower, re.IGNORECASE):
                            # Try current line first
                            num = find_number_in_text(line)
                            if num is not None and num > 0:
                                return num
                            # Try next 2 lines
                            for j in range(i+1, min(i+3, len(lines_list))):
                                num = find_number_in_text(lines_list[j])
                                if num is not None and num > 0:
                                    return num
                return default
            
            # ---------------- Improved Heuristic Parsing ----------------
            # Goal: Robustly extract all InBody fields including gender, age, inbody_score,
            # segmental muscle masses, weight, skeletal muscle, body fat mass, height, BMI, body fat %

            parsed_values = {
                'gender': None,
                'age': None,
                'height_cm': None,
                'weight_kg': None,
                'inbody_score': None,
                'skeletal_muscle_mass_kg': None,
                'body_fat_mass_kg': None,
                'body_fat_percentage': None,
                'bmi': None,
                'segment_right_arm_kg': None,
                'segment_left_arm_kg': None,
                'segment_trunk_kg': None,
                'segment_right_leg_kg': None,
                'segment_left_leg_kg': None,
            }

            # 1. Height (easy): lines ending with 'cm'
            for line in lines:
                m_h = re.match(r'(\d+\.?\d*)\s*cm$', line.strip(), re.IGNORECASE)
                if m_h:
                    val = to_float(m_h.group(1))
                    if val and 100 < val < 230:
                        parsed_values['height_cm'] = val
                        break

            # 2. Range pattern lines: e.g. "59.1 (45.0-60.8)" -> first number is value
            range_line_regex = re.compile(r'^(\d+\.?\d*)\s*\(\s*(\d+\.?\d*)\s*-\s*(\d+\.?\d*)\s*\)$')
            range_candidates = []  # list of dicts {value, low, high, raw}
            for line in lines:
                m_r = range_line_regex.match(line.strip())
                if m_r:
                    value = to_float(m_r.group(1))
                    low = to_float(m_r.group(2))
                    high = to_float(m_r.group(3))
                    if value is not None and low is not None and high is not None:
                        range_candidates.append({'value': value, 'low': low, 'high': high, 'raw': line})

            # Classify range candidates:
            # Heuristics:
            #   - weight: largest value between 30-200 OR line containing 'Weight'
            #   - body fat mass: value between 3-80 whose high < 25
            #   - remaining value between 10-50 could be skeletal muscle proxy if not found elsewhere.

            # Explicit weight by keyword first
            for line in lines:
                if re.search(r'weight', line, re.IGNORECASE):
                    num = find_number_in_text(line)
                    if num and 30 < num < 200:
                        parsed_values['weight_kg'] = num
                        break

            if parsed_values['weight_kg'] is None:
                weight_candidate = None
                for c in range_candidates:
                    if 30 < c['value'] < 200:
                        if weight_candidate is None or c['value'] > weight_candidate['value']:
                            weight_candidate = c
                if weight_candidate:
                    parsed_values['weight_kg'] = weight_candidate['value']

            # Body fat mass by low/high range characteristics
            for c in range_candidates:
                if 3 < c['value'] < 80 and c['high'] and c['high'] < 25:
                    parsed_values['body_fat_mass_kg'] = c['value']
                    break

            # Skeletal muscle mass: look for standalone number followed or preceded by fuzzy muscle label
            muscle_label_tokens = ['ske', 'skel', 'smm', 'mus', 'musc', 'muncle', 'mast']
            for idx, line in enumerate(lines):
                # standalone numeric line
                m_num = re.match(r'^(\d+\.?\d*)$', line.strip())
                if m_num:
                    val = to_float(m_num.group(1))
                    if not (val and 10 < val < 50):
                        continue
                    # check next line for fuzzy muscle label
                    next_line = lines[idx+1].lower() if idx + 1 < len(lines) else ''
                    prev_line = lines[idx-1].lower() if idx - 1 >= 0 else ''
                    def has_muscle_label(t: str):
                        return any(tok in t for tok in muscle_label_tokens)
                    if has_muscle_label(next_line) or has_muscle_label(prev_line):
                        parsed_values['skeletal_muscle_mass_kg'] = val
                        break

            # Fallback skeletal muscle from remaining range candidate (value 10-50 not already chosen) if still missing
            if parsed_values['skeletal_muscle_mass_kg'] is None:
                for c in range_candidates:
                    if 10 < c['value'] < 50 and c['value'] != parsed_values['body_fat_mass_kg']:
                        parsed_values['skeletal_muscle_mass_kg'] = c['value']
                        break

            # Gender: look for Male/Female or Korean 남성/여성
            for line in lines[:8]:
                if re.search(r"\b(male|female|m|f|남성|여성)\b", line, re.IGNORECASE):
                    if re.search(r"남성|male|^m$", line, re.IGNORECASE):
                        parsed_values['gender'] = 'Male'
                    elif re.search(r"여성|female|^f$", line, re.IGNORECASE):
                        parsed_values['gender'] = 'Female'
                    break

            # Age: look for 'Age' or '연령' followed by a number
            for i, line in enumerate(lines[:12]):
                if re.search(r'\bage\b|연령', line, re.IGNORECASE):
                    num = find_number_in_text(line)
                    if num and 5 < num < 120:
                        parsed_values['age'] = int(num)
                        break

            # InBody Score: search for 'score' or 'inbody' with a small integer (0-100)
            for i, line in enumerate(lines[:12]):
                if re.search(r'inbody\s*score|total\s*score|score', line, re.IGNORECASE):
                    num = find_number_in_text(line)
                    if num and 0 <= num <= 100:
                        parsed_values['inbody_score'] = int(num)
                        break

            # Segmental muscle detection: look for keywords and nearby numeric value
            seg_map = [
                ('segment_right_arm_kg', [r'right\s*arm', r'우측\s*팔', r'R\.?\s*Arm', r'RA']),
                ('segment_left_arm_kg', [r'left\s*arm', r'좌측\s*팔', r'L\.?\s*Arm', r'LA']),
                ('segment_trunk_kg', [r'trunk', r'몸통', r'body', r'torso']),
                ('segment_right_leg_kg', [r'right\s*leg', r'우측\s*다리', r'R\.?\s*Leg', r'RL']),
                ('segment_left_leg_kg', [r'left\s*leg', r'좌측\s*다리', r'L\.?\s*Leg', r'LL']),
            ]

            for key, patterns in seg_map:
                for idx, line in enumerate(lines):
                    for p in patterns:
                        if re.search(p, line, re.IGNORECASE):
                            # try same line first
                            num = find_number_in_text(line)
                            if num is not None and 0.5 < num < 20:
                                parsed_values[key] = num
                                break
                            # try next two lines
                            for j in range(idx+1, min(idx+3, len(lines))):
                                num = find_number_in_text(lines[j])
                                if num is not None and 0.5 < num < 20:
                                    parsed_values[key] = num
                                    break
                    if parsed_values.get(key) is not None:
                        break

            # BMI: search near 'BMI'; ignore axis tick lines (integer multiples etc > 50)
            for i, line in enumerate(lines):
                if re.search(r'\bBMI\b', line):
                    # look ahead a few lines for float 10-50
                    for j in range(i, min(i+6, len(lines))):
                        num = find_number_in_text(lines[j])
                        if num and 10 < num < 50:
                            parsed_values['bmi'] = num
                            break
                    break

            # Body fat percentage: find line with % or compute from mass & weight
            for line in lines:
                m_pct = re.search(r'(\d+\.?\d*)\s*%', line)
                if m_pct:
                    val = to_float(m_pct.group(1))
                    if val and 5 < val < 65:
                        parsed_values['body_fat_percentage'] = val
                        break

            # Fallback computations
            if parsed_values['body_fat_percentage'] is None and parsed_values['body_fat_mass_kg'] and parsed_values['weight_kg']:
                pct = (parsed_values['body_fat_mass_kg'] / parsed_values['weight_kg']) * 100.0
                if 5 < pct < 65:
                    parsed_values['body_fat_percentage'] = round(pct, 1)

            if parsed_values['bmi'] is None and parsed_values['weight_kg'] and parsed_values['height_cm']:
                h_m = parsed_values['height_cm'] / 100.0
                bmi_calc = parsed_values['weight_kg'] / (h_m * h_m)
                if 10 < bmi_calc < 60:
                    parsed_values['bmi'] = round(bmi_calc, 1)

            parsed.update(parsed_values)

            raw_lines = [{'text': it['text'], 'type': it['type'], 'confidence': it.get('confidence')} for it in items if it.get('type') == 'LINE']

            # Persist image and parsed result
            filename = f"inbody_{request.user.id}.jpg"
            record = InbodyRecord(user=request.user, source='rekognition', parsed=parsed)
            record.image.save(filename, ContentFile(img_bytes), save=True)

            # Update UserProfile with the new data
            try:
                profile, _ = UserProfile.objects.get_or_create(user=request.user)
                updated = False
                for key, value in parsed.items():
                    if value is not None and hasattr(profile, key):
                        setattr(profile, key, value)
                        updated = True
                if updated:
                    profile.save()
                    logger.info(f"Updated UserProfile for user {request.user.id} with InBody data (Rekognition)")
            except Exception as e:
                logger.error(f"Failed to update UserProfile: {e}")

            return Response({
                'source': 'rekognition',
                'parsed': parsed,
                'raw_lines': raw_lines,
                'record': {
                    'id': record.id,
                    'image_url': record.image.url,
                    'created_at': record.created_at.isoformat(),
                }
            })

        except Exception as e:
            logger.exception('Inbody analyze failed')
            return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class InbodyRecordListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = InbodyRecord.objects.filter(user=request.user).order_by('-created_at')
        serializer = InbodyRecordSerializer(qs, many=True, context={'request': request})
        return Response(serializer.data)

class InbodyRecordLatestView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rec = InbodyRecord.objects.filter(user=request.user).order_by('-created_at').first()
        if not rec:
            return Response({}, status=status.HTTP_204_NO_CONTENT)
        serializer = InbodyRecordSerializer(rec, context={'request': request})
        return Response(serializer.data)