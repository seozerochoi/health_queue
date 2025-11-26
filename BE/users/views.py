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
        use_gpt = getattr(settings, 'INBODY_GPT_ENABLED', False)
        if OpenAI and api_key and use_gpt:
            try:
                b64 = base64.b64encode(img_bytes).decode('utf-8')
                client = OpenAI(api_key=api_key)

                system_prompt = (
                    "당신은 인바디 결과표 이미지를 구조화된 데이터로 추출하는 도우미입니다. "
                    "숫자만 추출하여 JSON으로 반환하세요. 단위는 다음 규칙을 따르세요: "
                    "weight_kg(kg), body_fat_percentage(%), skeletal_muscle_mass_kg(kg), bmi(값), "
                    "height_cm(cm, 선택), body_fat_mass_kg(kg, 선택), muscle_mass_kg(kg, 선택). "
                    "반드시 JSON만 출력하고 설명, 코드블록, 기타 텍스트는 금지합니다."
                )

                user_prompt = (
                    "이미지에서 다음 항목을 찾아서 숫자만 반환:")

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
                                    "image_url": {"url": f"data:image/jpeg;base64,{b64}"}
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

                parsed = {
                    'weight_kg': to_num(data.get('weight_kg')),
                    'body_fat_percentage': to_num(data.get('body_fat_percentage')),
                    'skeletal_muscle_mass_kg': to_num(data.get('skeletal_muscle_mass_kg')),
                    'bmi': to_num(data.get('bmi')),
                    'height_cm': to_num(data.get('height_cm')),
                    'body_fat_mass_kg': to_num(data.get('body_fat_mass_kg')),
                    'muscle_mass_kg': to_num(data.get('muscle_mass_kg')),
                }

                # Persist image and parsed result
                filename = f"inbody_{request.user.id}.jpg"
                record = InbodyRecord(user=request.user, source='gpt', parsed=parsed)
                record.image.save(filename, ContentFile(img_bytes), save=True)

                return Response({
                    'source': 'gpt',
                    'parsed': parsed,
                    'record': {
                        'id': record.id,
                        'image_url': record.image.url,
                        'created_at': record.created_at.isoformat(),
                    }
                })

            except Exception:
                logger.exception('Inbody analyze via GPT failed; falling back to Rekognition')
                # continue to Rekognition fallback

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
            parsed['weight_kg'] = find_by_keywords([r"체중", r"몸무게", r"weight"], unit_hint='kg')
            if parsed['weight_kg'] is None:
                m = re.search(r"([0-9]+(?:[\.,][0-9]+)?)\s*(kg|㎏)\b", concat, re.IGNORECASE)
                if m:
                    parsed['weight_kg'] = to_float(m.group(1))

            parsed['body_fat_percentage'] = find_by_keywords([r"체지방률", r"체지방", r"체지방율", r"body fat", r"bodyfat"], unit_hint='%')
            if parsed['body_fat_percentage'] is None:
                m = re.search(r"([0-9]+(?:[\.,][0-9]+)?)\s*(%|퍼센트)", concat, re.IGNORECASE)
                if m:
                    parsed['body_fat_percentage'] = to_float(m.group(1))

            parsed['skeletal_muscle_mass_kg'] = find_by_keywords([r"골격근량", r"골격근", r"skeletal muscle", r"SMM", r"muscle"], unit_hint='kg')
            if parsed['skeletal_muscle_mass_kg'] is None:
                m = re.search(r"(골격근량|골격근|SMM|skeletal muscle|muscle)[:\s]*([0-9]+(?:[\.,][0-9]+)?)\s*(kg)?", concat, re.IGNORECASE)
                if m:
                    parsed['skeletal_muscle_mass_kg'] = to_float(m.group(2))

            parsed['bmi'] = find_by_keywords([r"BMI", r"체질량지수"], unit_hint=None)
            if parsed['bmi'] is None:
                m = re.search(r"\b([0-9]+(?:[\.,][0-9]+)?)\s*BMI\b", concat, re.IGNORECASE)
                if m:
                    parsed['bmi'] = to_float(m.group(1))

            if parsed.get('weight_kg') is None:
                m = re.search(r"([0-9]+(?:[\.,][0-9]+)?)\s*(kg|㎏)\b", concat, re.IGNORECASE)
                if m:
                    parsed['weight_kg'] = to_float(m.group(1))

            raw_lines = [{'text': it['text'], 'type': it['type'], 'confidence': it.get('confidence')} for it in items if it.get('type') == 'LINE']

            # Persist image and parsed result
            filename = f"inbody_{request.user.id}.jpg"
            record = InbodyRecord(user=request.user, source='rekognition', parsed=parsed)
            record.image.save(filename, ContentFile(img_bytes), save=True)

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