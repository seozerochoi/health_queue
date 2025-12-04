# NFC 동작 흐름 및 404 에러 원인 분석

## 📊 NFC 데이터 흐름도

```
┌─────────────────────────────────────────────────────────────────┐
│                     Android 휴대폰 (NFC 태그)                    │
│                    ┌────────────────────┐                       │
│                    │ NFC 물리적 태그    │                       │
│                    │ Data: "NFC001"     │                       │
│                    └────────────────────┘                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓ (NFC 태그 감지)
┌─────────────────────────────────────────────────────────────────┐
│                    FE: React (TypeScript)                       │
│                                                                  │
│  1️⃣ NFCReader.tsx (Web NFC API)                               │
│     ↓                                                            │
│     ndef.onreading = (event) => {                              │
│       const textDecoder = new TextDecoder();                    │
│       const equipmentId = textDecoder.decode(record.data);      │
│       // "NFC001" 추출                                          │
│       onTagDetected(equipmentId.trim());                        │
│     }                                                            │
│     ↓                                                            │
│  2️⃣ App.tsx (handleNFCTagDetected)                            │
│     ↓                                                            │
│     const nfcTagId = String(equipmentId);  // "NFC001"         │
│     setNfcTagValue(nfcTagId);  // 화면 표시용                 │
│     ↓                                                            │
│  3️⃣ API 호출                                                   │
│     ↓                                                            │
│     POST /api/workouts/start/                                  │
│     {                                                            │
│       "nfc_tag_id": "NFC001"                                    │
│     }                                                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    BE: Django REST API                          │
│                                                                  │
│  1️⃣ StartSessionView.post()                                   │
│     ↓                                                            │
│     nfc_tag_id = request.data.get('nfc_tag_id')                │
│     # "NFC001" 수신                                            │
│     ↓                                                            │
│  2️⃣ Equipment 조회                                            │
│     ↓                                                            │
│     equipment = Equipment.objects.get(nfc_tag_id=nfc_tag_id)   │
│     # nfc_tag_id="NFC001"인 기구 찾기                         │
│     ↓                                                            │
│  3️⃣ 결과                                                       │
│     ✅ 성공: Equipment(id=1, name='벤치프레스', ...)          │
│     ❌ 실패: Equipment.DoesNotExist → 404 반환                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔴 404 에러 발생 원인 분석

### 가능한 원인들 (우선순위)

#### 1️⃣ **데이터 인코딩 문제** (확률 높음)

- NFC 태그에서 읽은 원본 데이터에 숨겨진 문자가 있을 수 있음
- 예시:
  - `"NFC001 "` (뒤에 공백) ≠ DB의 `"NFC001"`
  - `" NFC001"` (앞에 공백) ≠ DB의 `"NFC001"`
  - `"NFC001\x00"` (null byte) ≠ DB의 `"NFC001"`
  - `"nfc001"` (소문자) ≠ DB의 `"NFC001"`

**해결책:**

```python
# BE에서 대소문자 무시하고 검색
equipment = Equipment.objects.get(nfc_tag_id__iexact=nfc_tag_id)
```

#### 2️⃣ **토큰 만료** (확률 중간)

- JWT 토큰이 만료되어 `IsAuthenticated` 권한 실패
- 하지만 이 경우 401 Unauthorized가 반환되어야 함
- 404가 반환되는 건 권한 문제가 아니라 조회 실패임을 의미

#### 3️⃣ **DB 조회 경합 문제** (확률 낮음)

- `select_for_update()` 때문에 lock timeout 발생
- 다른 세션에서 equipment를 수정 중일 때

#### 4️⃣ **네트워크 문제** (확률 낮음)

- 요청 바디가 손상되어 전송됨
- 서버에서 요청을 제대로 받지 못함

---

## 🔧 디버깅을 위해 추가한 로깅

### FE (NFCReader.tsx)

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

**예상 출력:**

```
✅ NFC 태그 감지
  - 원본: "NFC001"
  - Trim 후: "NFC001"
  - 길이: 6
  - Char codes: 78, 70, 67, 48, 48, 49
  - Hex: 4e 46 43 30 30 31
```

### FE (App.tsx handleNFCTagDetected)

```typescript
console.log(`  - 원본 값: "${equipmentId}"`);
console.log(`  - String 변환: "${nfcTagId}"`);
console.log(`  - 길이: ${nfcTagId.length}`);
console.log(
  `  - Char codes: ${[...nfcTagId].map((c) => c.charCodeAt(0)).join(", ")}`
);
```

### BE (StartSessionView.post)

```python
logger.info(f"🔍 [StartSessionView.post] NFC/Equipment 요청")
logger.info(f"  - nfc_tag_id: '{nfc_tag_id}' (type: {type(nfc_tag_id).__name__})")
logger.info(f"  - nfc_tag_id hex: {nfc_tag_id.encode('utf-8').hex()}")
logger.info(f"  - nfc_tag_id length: {len(nfc_tag_id)}")
logger.info(f"📋 [StartSessionView] DB의 모든 nfc_tag_id 목록: {all_nfc_tags}")
logger.info(f"🔍 nfc_tag_id로 조회 시도: '{nfc_tag_id}'")
logger.info(f"✅ 기구 조회 성공: ID={equipment.id}, Name={equipment.name}")
logger.error(f"❌ 기구 조회 실패 (DoesNotExist)")
```

---

## 📋 테스트 절차

### Step 1: FE 콘솔 로그 확인

1. Android 휴대폰에서 개발자 도구 열기
2. NFC 태그 스캔
3. 콘솔 로그 확인:
   ```
   ✅ NFC 태그 감지
     - 원본: "NFC001"
     - Trim 후: "NFC001"
     - 길이: 6
     - Char codes: 78, 70, 67, 48, 48, 49
     - Hex: 4e 46 43 30 30 31
   ```

### Step 2: FE API 호출 로깅 확인

```
📡 API 호출: POST https://43.201.88.27/api/workouts/start/
📤 전송 데이터:
{
  "nfc_tag_id": "NFC001"
}
```

### Step 3: BE 서버 로그 확인

Ubuntu 서버에서:

```bash
tail -f /var/log/health_queue/django.log
# 또는
journalctl -u health_queue -f
```

로그 예상 출력:

```
🔍 [StartSessionView.post] NFC/Equipment 요청
  - nfc_tag_id: 'NFC001' (type: str)
  - nfc_tag_id hex: 4e46433030303031
  - nfc_tag_id length: 6
  - user: testuser (ID: 1)
📋 [StartSessionView] DB의 모든 nfc_tag_id 목록: ['NFC001', 'NFC002', 'NFC004', ...]
🔍 nfc_tag_id로 조회 시도: 'NFC001'
✅ 기구 조회 성공: ID=1, Name=벤치프레스, NFC=NFC001
```

---

## ✅ 문제 해결 순서

1. **FE 콘솔 로그 확인**

   - NFC 데이터가 정상적으로 읽혔는지 확인
   - Char codes 및 Hex가 올바른지 확인

2. **API 호출 로깅 확인**

   - 전송되는 JSON 데이터 확인
   - nfc_tag_id 값이 올바른지 확인

3. **BE 서버 로그 확인**

   - 받은 nfc_tag_id 값 확인
   - DB 조회 결과 확인

4. **맞지 않는 부분 발견 후 수정**
   - 데이터 불일치 → 정규화 (trim, lower, etc.)
   - 인코딩 문제 → 인코딩 처리
   - DB 값 오류 → 마이그레이션

---

## 🎯 예상되는 최종 결과

NFC001로 태그하면:

```
✅ NFC 태그 "NFC001" 인식 성공!
운동을 시작합니다.

[WorkoutTimer 화면으로 이동]
```

만약 여전히 404가 나면:

```
❌ NFC 태그: NFC001

운동 시작에 실패했습니다.

응답 코드: 404
에러: 해당 기구를 찾을 수 없습니다.

[FE 콘솔과 BE 로그를 비교하여 원인 파악]
```

---

## 💡 기타 참고사항

### NFC 태그 데이터 형식

- **Type**: NDEF (NFC Data Exchange Format)
- **Record Type**: "text"
- **Encoding**: UTF-8
- **Content**: "NFC001" (6 bytes)

### Django ORM 조회 방식

```python
# 정확한 매칭
equipment = Equipment.objects.get(nfc_tag_id=nfc_tag_id)

# 대소문자 무시
equipment = Equipment.objects.get(nfc_tag_id__iexact=nfc_tag_id)

# 부분 매칭
equipment = Equipment.objects.get(nfc_tag_id__icontains=nfc_tag_id)
```

### 토큰 검증

```python
# BE에서 토큰 확인
user = request.user
print(f"User: {user}")
print(f"Is Authenticated: {user.is_authenticated}")
print(f"User ID: {user.id}")
```
