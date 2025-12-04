# NFC 404 에러 디버깅 가이드

## 🚀 현재 상황

- ✅ DB에 `NFC001` 존재 (ID=1, Name=벤치프레스)
- ❌ FE에서 `NFC001`로 API 호출하면 404 에러 발생
- ❌ 에러 메시지: "해당 기구를 찾을 수 없습니다"

---

## 📝 수정 사항

### 1. FE: NFCReader.tsx (NFC 데이터 읽기)

**추가된 상세 로깅:**

```typescript
console.log(`  - 원본: "${equipmentId}"`);
console.log(`  - Trim 후: "${trimmedId}"`);
console.log(`  - 길이: ${trimmedId.length}`);
console.log(
  `  - Char codes: ${[...trimmedId].map((c) => c.charCodeAt(0)).join(", ")}`
);
console.log(
  `  - Hex: ${trimmedId
    .split("")
    .map((c) => c.charCodeAt(0).toString(16))
    .join(" ")}`
);
```

### 2. FE: App.tsx (API 호출)

**추가된 상세 로깅:**

```typescript
console.log(`  - 원본 값: "${equipmentId}"`);
console.log(`  - String 변환: "${nfcTagId}"`);
console.log(`  - 길이: ${nfcTagId.length}`);
console.log(
  `  - Char codes: ${[...nfcTagId].map((c) => c.charCodeAt(0)).join(", ")}`
);

// API 호출 전
console.log(`📡 API 호출: POST ${apiBase}/api/workouts/start/`);
console.log(`📤 전송 데이터:`, JSON.stringify(requestPayload, null, 2));

// API 응답
console.log(`📥 API 응답 상태: ${response.status} ${response.statusText}`);
```

### 3. BE: StartSessionView.post() (NFC 조회)

**추가된 상세 로깅:**

```python
logger.info(f"🔍 [StartSessionView.post] NFC/Equipment 요청")
logger.info(f"  - nfc_tag_id: '{nfc_tag_id}' (type: {type(nfc_tag_id).__name__})")
logger.info(f"  - nfc_tag_id hex: {nfc_tag_id.encode('utf-8').hex()}")
logger.info(f"  - nfc_tag_id length: {len(nfc_tag_id)}")

# DB의 모든 NFC 태그 출력
all_nfc_tags = list(Equipment.objects.values_list('nfc_tag_id', flat=True).distinct())
logger.info(f"📋 [StartSessionView] DB의 모든 nfc_tag_id 목록: {all_nfc_tags}")

# 실제 조회 시도
logger.info(f"🔍 nfc_tag_id로 조회 시도: '{nfc_tag_id}'")
equipment = Equipment.objects.get(nfc_tag_id=nfc_tag_id)
logger.info(f"✅ 기구 조회 성공: ID={equipment.id}, Name={equipment.name}")
```

---

## 🔍 테스트 절차

### Step 1: 서버 로그 모니터링 시작

```bash
# Ubuntu 서버에서
tail -f /path/to/django.log

# 또는 systemd 로그
journalctl -u health_queue -f
```

### Step 2: Android에서 NFC 태그 스캔

1. 앱 실행
2. 기구 목록 화면에서 NFC 스캔 활성화 확인
3. NFC001 태그를 휴대폰에 대기

### Step 3: FE 콘솔 로그 확인

Chrome DevTools → Console 탭에서 다음 메시지 확인:

```
✅ NFC 태그 감지
  - 원본: "NFC001"
  - Trim 후: "NFC001"
  - 길이: 6
  - Char codes: 78, 70, 67, 48, 48, 49
  - Hex: 4e 46 43 30 30 31

🏷️ NFC 태그로 운동 시작
  - 원본 값: "NFC001"
  - String 변환: "NFC001"
  - 길이: 6
  - Char codes: 78, 70, 67, 48, 48, 49

📡 API 호출: POST https://43.201.88.27/api/workouts/start/
📤 전송 데이터:
{
  "nfc_tag_id": "NFC001"
}

📥 API 응답 상태: 404 Not Found
```

### Step 4: BE 서버 로그 확인

```
🔍 [StartSessionView.post] NFC/Equipment 요청
  - nfc_tag_id: 'NFC001' (type: str)
  - nfc_tag_id hex: 4e46433030303031
  - nfc_tag_id length: 6
  - user: testuser (ID: 1)
📋 [StartSessionView] DB의 모든 nfc_tag_id 목록: ['NFC001', 'NFC002', 'NFC004', 'NFC006', 'NFC007', ...]
🔍 nfc_tag_id로 조회 시도: 'NFC001'
❌ 기구 조회 실패 (DoesNotExist): nfc_tag_id='NFC001', equipment_id='None'
```

---

## 🔧 문제 해결 가능성

### 가능성 1: Hex 값 불일치

**증상:**

```
FE: Char codes: 78, 70, 67, 48, 48, 49
    Hex: 4e 46 43 30 30 31
```

**분석:**

- 78 = 0x4E = 'N'
- 70 = 0x46 = 'F'
- 67 = 0x43 = 'C'
- 48 = 0x30 = '0'
- 48 = 0x30 = '0'
- 49 = 0x31 = '1'

이것이 정상입니다.

### 가능성 2: 숨겨진 공백

**증상:**

```
Char codes: 78, 70, 67, 48, 48, 49, 32  ← 32는 space
```

**해결:**
이미 `trim()`하고 있으므로 해결됩니다.

### 가능성 3: 대소문자 불일치

**증상:**

```
FE에서: "nfc001" (소문자)
BE DB에서: "NFC001" (대문자) 찾음
```

**즉각적 해결:**

```python
# BE에서
equipment = Equipment.objects.get(nfc_tag_id__iexact=nfc_tag_id)  # 대소문자 무시
```

### 가능성 4: 토큰 만료

**증상:**

```
📥 API 응답 상태: 401 Unauthorized
```

**해결:**

```bash
# 새로 로그인
```

---

## 📊 예상 결과

### ✅ 성공 시나리오

```
FE 콘솔:
✅ NFC 태그 감지
  - 원본: "NFC001"
  - Trim 후: "NFC001"
  - 길이: 6

API 호출:
📡 API 호출: POST https://43.201.88.27/api/workouts/start/
📤 전송 데이터: { "nfc_tag_id": "NFC001" }
📥 API 응답 상태: 200 OK

BE 로그:
✅ 기구 조회 성공: ID=1, Name=벤치프레스

사용자 화면:
✅ NFC 태그 "NFC001" 인식 성공!
운동을 시작합니다.

[WorkoutTimer 화면으로 전환]
```

### ❌ 실패 시나리오 (디버깅)

```
FE 콘솔:
✅ NFC 태그 감지
  - 원본: "NFC001 "  ← 뒤에 공백!
  - Trim 후: "NFC001"
  - 길이: 6

API 응답:
📥 API 응답 상태: 404 Not Found

BE 로그:
🔍 nfc_tag_id: 'NFC001' (trim되어 도착)
📋 DB의 모든 nfc_tag_id 목록: ['NFC001', 'NFC002', ...]
❌ 기구 조회 실패

원인: NFC 태그의 원본에 공백이 있었음
     FE에서 trim() 처리하여 문제 해결됨
```

---

## 🎯 다음 단계

1. **디버깅 로그 출력 수집**

   - FE 콘솔 스크린샷
   - BE 서버 로그

2. **로그 비교 분석**

   - FE에서 보낸 값과 BE에서 받은 값 비교
   - Hex 값 비교하여 인코딩 문제 확인

3. **문제 식별 및 해결**

   - 대소문자 불일치 → `iexact` 사용
   - 숨겨진 공백 → `strip()` 추가
   - 인코딩 문제 → 인코딩 처리

4. **테스트 재실행**
   - NFC 태그 재스캔
   - 성공 확인

---

## 💡 추가 팁

### 콘솔 로그 자동 정리

```typescript
// 실제 배포 시 로그 숨기기
if (process.env.NODE_ENV === "development") {
  console.log(`📡 API 호출: ${apiBase}/api/workouts/start/`);
}
```

### BE 로그 레벨 조정

```python
# settings.py
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'DEBUG',  # 또는 'INFO'
    },
}
```

### 빠른 재현 방법

```bash
# BE 쉘에서 직접 테스트
python manage.py shell

>>> from equipment.models import Equipment
>>> eq = Equipment.objects.get(nfc_tag_id='NFC001')
>>> print(eq.id, eq.name, eq.nfc_tag_id)
# 1 벤치프레스 NFC001
```
