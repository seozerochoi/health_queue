# AWS Rekognition OCR 설정 가이드

## 개요
이 프로젝트는 AWS Rekognition을 사용하여 인바디 측정 결과지에서 데이터를 자동으로 추출합니다.

## AWS 설정

### 1. AWS 계정 생성
- AWS Free Tier 계정 생성 (https://aws.amazon.com/free/)
- 첫 12개월 동안 Rekognition API 무료 사용 가능
  - 매월 5,000건의 이미지 분석 무료

### 2. IAM 사용자 생성
1. AWS Console → IAM → Users → Add User
2. 사용자 이름 입력 (예: `health-queue-ocr`)
3. "Programmatic access" 선택
4. 권한 설정:
   - "Attach existing policies directly" 선택
   - `AmazonRekognitionReadOnlyAccess` 정책 연결
5. Access Key ID와 Secret Access Key 저장 (한 번만 표시됨!)

### 3. 환경 변수 설정

#### 로컬 개발 환경 (.env 파일)
```bash
# BE/.env 파일에 추가
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_REGION=ap-northeast-2
```

#### 프로덕션 환경 (클라우드타입 등)
환경 변수 설정에서 다음 값 추가:
- `AWS_ACCESS_KEY_ID`: IAM 사용자의 Access Key ID
- `AWS_SECRET_ACCESS_KEY`: IAM 사용자의 Secret Access Key
- `AWS_REGION`: `ap-northeast-2` (서울 리전)

## API 사용법

### 인바디 이미지 업로드 및 OCR

**Endpoint:** `POST /api/users/inbody/upload/`

**Headers:**
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Request Body (Option 1 - base64):**
```json
{
  "image": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
  "auto_save": false
}
```

**Request Body (Option 2 - File Upload):**
```
Content-Type: multipart/form-data
image: [file]
auto_save: false
```

**Response (Success):**
```json
{
  "message": "OCR 처리가 완료되었습니다.",
  "data": {
    "weight_kg": 70.5,
    "skeletal_muscle_mass_kg": 32.1,
    "body_fat_mass_kg": 12.3,
    "body_fat_percentage": 17.5,
    "bmi": 23.4,
    "inbody_score": 85
  },
  "detected_texts": [
    "체중 70.5",
    "골격근량 32.1",
    ...
  ]
}
```

## Frontend 사용법

### 인바디 촬영 플로우
1. **마이페이지** 접속
2. **"인바디 사진 촬영"** 버튼 클릭
3. **카메라 촬영** 또는 **갤러리 선택**
4. 이미지 조정:
   - 크롭 영역 드래그로 조정
   - "회전" 버튼으로 이미지 회전
5. **"분석하기"** 버튼 클릭
6. OCR 결과 확인
7. **"저장하기"** 버튼으로 프로필에 저장

### 클라이언트 전처리
이미지는 다음 과정을 거쳐 전처리됩니다:
- 크롭 및 회전 적용
- 대비 향상 (1.2배)
- 밝기 조정 (+10)
- JPEG 압축 (품질 95%)

## 지원하는 인바디 항목
- 체중 (weight_kg)
- 골격근량 (skeletal_muscle_mass_kg)
- 체지방량 (body_fat_mass_kg)
- 체지방률 (body_fat_percentage)
- BMI (bmi)
- 인바디점수 (inbody_score)
- 부위별 근육량 (팔, 다리, 몸통)

## 문제 해결

### AWS 인증 오류
```
Error: AWS Rekognition 텍스트 감지 실패
```
- AWS 환경 변수가 올바르게 설정되었는지 확인
- IAM 사용자 권한 확인
- AWS 리전 확인

### OCR 정확도 개선
- 인바디 결과지를 평평하게 펴서 촬영
- 조명이 충분한 곳에서 촬영
- 텍스트가 선명하게 보이도록 초점 맞춤
- 크롭 기능으로 불필요한 부분 제거

## 비용 안내
- AWS Rekognition Free Tier: 월 5,000건 무료
- 초과 시: 이미지당 $0.001 (1,000건당 $1)
- 프리티어 초과 방지를 위해 사용량 모니터링 권장

## 보안 주의사항
- AWS 자격증명을 절대 코드에 하드코딩하지 마세요
- .env 파일을 .gitignore에 추가하세요
- IAM 사용자에 최소 권한만 부여하세요
- Access Key는 주기적으로 로테이션하세요
