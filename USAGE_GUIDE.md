# 인바디 OCR 사용 가이드 및 문제 해결

## 빠른 시작

### 1. 환경 설정

#### Backend 환경 변수 설정
```bash
# BE/.env 파일 생성
cp BE/.env.example BE/.env

# 필수 환경 변수 입력
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_REGION=ap-northeast-2
```

#### AWS IAM 설정
1. AWS Console → IAM → Users → Add User
2. 사용자 이름: `health-queue-ocr`
3. 권한: `AmazonRekognitionReadOnlyAccess`
4. Access Key 생성 및 저장

### 2. 의존성 설치

#### Backend
```bash
cd BE
pip install boto3  # 이미 requirements.txt에 포함됨
```

#### Frontend
```bash
cd FE
npm install react-image-crop
```

### 3. 서버 실행

#### Backend
```bash
cd BE
python manage.py runserver
```

#### Frontend
```bash
cd FE
npm run dev
```

## 사용 방법

### 사용자 관점

1. **마이페이지 접속**
   - 로그인 후 마이페이지로 이동

2. **인바디 사진 촬영 버튼 클릭**
   - 화면의 "인바디 사진 촬영" 버튼 클릭

3. **촬영 방식 선택**
   - "카메라로 촬영하기": 즉시 카메라 실행 (모바일)
   - "갤러리에서 선택하기": 기존 사진 선택

4. **이미지 조정**
   - 크롭 박스를 드래그하여 필요한 영역만 선택
   - "회전" 버튼으로 이미지 회전
   - 인바디 결과지의 텍스트가 잘 보이도록 조정

5. **분석하기**
   - "분석하기" 버튼 클릭
   - 2-5초 대기 (OCR 처리)

6. **결과 확인 및 저장**
   - 추출된 데이터 확인
   - "저장하기" 버튼으로 프로필에 저장
   - 또는 "다시 촬영"으로 재시도

### 개발자 관점

#### API 호출 예제

```javascript
// 인바디 이미지 업로드 및 OCR
const uploadInBodyImage = async (imageBase64) => {
  const access = localStorage.getItem("access_token");
  
  const response = await fetch(
    "http://43.201.88.27/api/users/inbody/upload/",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${access}`,
      },
      body: JSON.stringify({
        image: imageBase64,
        auto_save: false,
      }),
    }
  );
  
  const result = await response.json();
  return result;
};
```

#### Python 스크립트 예제

```python
import requests
import base64

# 이미지 파일 읽기
with open('inbody.jpg', 'rb') as f:
    image_data = base64.b64encode(f.read()).decode('utf-8')

# API 호출
response = requests.post(
    'http://43.201.88.27/api/users/inbody/upload/',
    headers={
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json',
    },
    json={
        'image': f'data:image/jpeg;base64,{image_data}',
        'auto_save': True,
    }
)

result = response.json()
print(result)
```

## 문제 해결

### 문제 1: AWS 인증 실패

**증상:**
```
AWS Rekognition 텍스트 감지 실패: Unable to locate credentials
```

**원인:**
- AWS 환경 변수가 설정되지 않음
- 잘못된 Access Key 또는 Secret Key

**해결 방법:**
1. `.env` 파일 확인
   ```bash
   cat BE/.env | grep AWS
   ```

2. 환경 변수 올바르게 설정
   ```bash
   AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
   AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
   AWS_REGION=ap-northeast-2
   ```

3. 서버 재시작
   ```bash
   python manage.py runserver
   ```

### 문제 2: 데이터 추출 실패

**증상:**
```json
{
  "message": "OCR 처리가 완료되었습니다.",
  "data": {},
  "detected_texts": ["..."]
}
```

**원인:**
- 이미지 품질이 낮음
- 텍스트가 흐림
- 키워드 매칭 실패

**해결 방법:**
1. 이미지 품질 개선
   - 밝은 조명에서 촬영
   - 초점 맞춤
   - 평평하게 펴서 촬영

2. 크롭 영역 조정
   - 불필요한 배경 제거
   - 텍스트 영역만 선택

3. detected_texts 확인
   - "감지된 텍스트 보기" 클릭
   - 어떤 텍스트가 감지되었는지 확인
   - 필요한 키워드가 포함되어 있는지 확인

### 문제 3: CORS 오류

**증상:**
```
Access to fetch at 'http://43.201.88.27/api/users/inbody/upload/' 
from origin 'http://localhost:5173' has been blocked by CORS policy
```

**해결 방법:**
1. Backend settings.py 확인
   ```python
   CORS_ALLOWED_ORIGINS = [
       "http://localhost:5173",
       "http://43.201.88.27",
   ]
   ```

2. corsheaders 설치 확인
   ```bash
   pip list | grep django-cors
   ```

### 문제 4: 401 Unauthorized

**증상:**
```json
{
  "detail": "Given token not valid for any token type"
}
```

**해결 방법:**
1. 토큰 갱신
   - 프론트엔드가 자동으로 토큰 갱신 시도
   - 실패 시 재로그인 필요

2. 토큰 확인
   ```javascript
   const access = localStorage.getItem("access_token");
   console.log("Access Token:", access);
   ```

### 문제 5: 이미지 크기 제한

**증상:**
```
Request Entity Too Large
```

**원인:**
- 이미지 파일이 너무 큼 (>10MB)

**해결 방법:**
1. 이미지 압축
   - 프론트엔드에서 자동 압축 (95% 품질)
   - 크롭 기능으로 불필요한 영역 제거

2. Django 설정 확인
   ```python
   # settings.py
   DATA_UPLOAD_MAX_MEMORY_SIZE = 10485760  # 10MB
   ```

### 문제 6: react-image-crop 오류

**증상:**
```
Cannot find module 'react-image-crop'
```

**해결 방법:**
```bash
cd FE
npm install react-image-crop
```

## 성능 최적화 팁

### 1. 이미지 크기 최적화
- 크롭 기능으로 필요한 영역만 선택
- 자동 압축 (JPEG 95% 품질)
- 예상 크기: 500KB - 1MB

### 2. 응답 시간 개선
- 예상 응답 시간: 3-5초
- 네트워크 상태에 따라 변동

### 3. AWS Free Tier 관리
- 월 5,000건 무료
- 사용량 모니터링
- CloudWatch로 확인

## 디버깅 방법

### Backend 로그 확인
```bash
# Django 개발 서버 로그
python manage.py runserver

# 특정 API 호출 로그
tail -f /var/log/django/debug.log
```

### Frontend 로그 확인
```javascript
// 브라우저 Console
console.log("OCR Result:", result);
```

### AWS Rekognition 테스트
```python
# test_aws_rekognition.py
from users.ocr_service import InBodyOCRService

service = InBodyOCRService()

with open('test_inbody.jpg', 'rb') as f:
    image_bytes = f.read()
    result = service.process_inbody_image(image_bytes)
    print(result)
```

## FAQ

### Q1: 인바디 기기가 다르면 작동하나요?
**A:** 대부분의 인바디 기기에서 작동합니다. 키워드 매핑이 "체중", "골격근량" 등 일반적인 용어를 사용하기 때문입니다. 단, 특수한 형식의 경우 키워드 매핑을 추가해야 할 수 있습니다.

### Q2: 영어로 된 인바디는 지원하나요?
**A:** 현재는 한국어 키워드만 지원합니다. 영어 지원을 위해서는 `ocr_service.py`의 `keyword_mapping`에 영어 키워드를 추가해야 합니다.

### Q3: 오프라인에서도 작동하나요?
**A:** 아니요. AWS Rekognition이 클라우드 서비스이기 때문에 인터넷 연결이 필요합니다.

### Q4: 비용이 얼마나 나올까요?
**A:** AWS Free Tier로 월 5,000건 무료입니다. 초과 시 이미지당 $0.001입니다.

### Q5: 개인정보는 안전한가요?
**A:** 
- 이미지는 OCR 처리 후 저장되지 않습니다
- AWS Rekognition은 이미지를 저장하지 않습니다
- 추출된 데이터만 데이터베이스에 저장됩니다

### Q6: 정확도는 얼마나 되나요?
**A:** 이미지 품질에 따라 다릅니다:
- 좋은 품질: 90%+ 정확도
- 보통 품질: 70-80% 정확도
- 낮은 품질: 50% 이하

### Q7: 수동 수정이 가능한가요?
**A:** 현재는 OCR 결과를 그대로 저장합니다. 향후 업데이트에서 수동 수정 기능을 추가할 예정입니다.

## 추가 리소스

- [AWS Rekognition 문서](https://docs.aws.amazon.com/rekognition/)
- [react-image-crop 문서](https://github.com/DominicTobias/react-image-crop)
- [Django REST Framework 문서](https://www.django-rest-framework.org/)

## 지원

문제가 계속되면:
1. GitHub Issues에 문의
2. 로그 파일 첨부
3. 이미지 샘플 제공 (개인정보 제거 후)
