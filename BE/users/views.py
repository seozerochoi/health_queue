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
                    # 최대 크기 제한 (긴 쪽 기준 1024px)
                    max_size = 1024
                    if max(img.size) > max_size:
                        ratio = max_size / max(img.size)
                        new_size = tuple(int(dim * ratio) for dim in img.size)
                        img = img.resize(new_size, Image.Resampling.LANCZOS)
                        
                        # 리사이즈된 이미지를 bytes로 변환
                        buffer = io.BytesIO()
                        img.save(buffer, format='JPEG', quality=85)
                        img_bytes_optimized = buffer.getvalue()
                        logger.info(f"📐 이미지 리사이즈: 원본 {len(img_bytes)} bytes → {len(img_bytes_optimized)} bytes")
                        img_bytes = img_bytes_optimized
                except Exception as resize_error:
                    logger.warning(f"이미지 리사이즈 실패, 원본 사용: {resize_error}")
                
                b64 = base64.b64encode(img_bytes).decode('utf-8')
                client = OpenAI(api_key=api_key)

                system_prompt = (
                    "당신은 인바디(InBody) 체성분 분석 결과지를 정확하게 읽는 전문가입니다.\n"
                    "다양한 인바디 모델(270, 770 등)의 결과지를 모두 정확하게 파싱할 수 있습니다.\n\n"
                    "핵심 추출 규칙:\n"
                    "1. **체중(kg)**: '체성분분석' 또는 'Body Composition Analysis' 섹션의 체중 측정값\n"
                    "   - '적정체중', '체중조절량', '목표체중' 등은 무시\n"
                    "   - 보통 30-200kg 범위\n\n"
                    "2. **골격근량(kg)**: 'Skeletal Muscle Mass' 또는 '골격근량'\n"
                    "   - '근육량(Muscle Mass)'와 혼동하지 말 것\n"
                    "   - 보통 10-50kg 범위\n\n"
                    "3. **체지방량(kg)**: 'Body Fat Mass' 또는 '체지방량'\n"
                    "   - 보통 3-80kg 범위\n\n"
                    "4. **체지방률(%)**: 'Percent Body Fat' 또는 '체지방률'\n"
                    "   - % 기호와 함께 표시됨\n"
                    "   - 보통 5-65% 범위\n\n"
                    "5. **BMI**: 'Body Mass Index' 또는 'BMI'\n"
                    "   - 비만도 지수\n"
                    "   - 보통 10-50 범위\n\n"
                    "6. **키(cm)**: 상단 기본정보의 '신장' 또는 'Height'\n"
                    "   - 보통 100-230cm 범위\n\n"
                    "주의: 괄호 안의 권장 범위나 표준값은 무시하고, 실제 측정된 현재 값만 추출하세요.\n"
                    "반드시 JSON 형식으로만 출력하고, 코드블록(```)이나 설명은 포함하지 마세요."
                )

                user_prompt = (
                    "이 인바디 결과지에서 현재 측정된 값만 추출하여 JSON으로 반환하세요:\n\n"
                    "{\n"
                    '  "weight_kg": 체중(현재값, 적정체중 아님),\n'
                    '  "skeletal_muscle_mass_kg": 골격근량(근육량 아님),\n'
                    '  "body_fat_mass_kg": 체지방량,\n'
                    '  "body_fat_percentage": 체지방률,\n'
                    '  "bmi": BMI,\n'
                    '  "height_cm": 키\n'
                    "}\n\n"
                    "예시 구분:\n"
                    "- 77.4 kg (체중조절 표준범위: 59.2-80.2) → weight_kg: 77.4 (현재값)\n"
                    "- 38.4 kg (골격근량) → skeletal_muscle_mass_kg: 38.4\n"
                    "- 10.2 kg (체지방량) → body_fat_mass_kg: 10.2\n"
                    "- 13.2% (체지방률) → body_fat_percentage: 13.2\n"
                    "- BMI 24.4 → bmi: 24.4\n"
                    "- 178cm → height_cm: 178\n\n"
                    "숫자만 추출하고, 괄호 안 권장값은 무시하세요."
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
                # Goal: Robustly extract weight, skeletal muscle, body fat mass, height, BMI, body fat %
                # even when Korean keywords are missing or OCR is noisy.

                parsed_values = {
                    'weight_kg': None,
                    'skeletal_muscle_mass_kg': None,
                    'body_fat_mass_kg': None,
                    'height_cm': None,
                    'bmi': None,
                    'body_fat_percentage': None,
                    'muscle_mass_kg': None,  # optional
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