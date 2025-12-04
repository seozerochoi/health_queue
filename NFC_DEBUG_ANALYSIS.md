# NFC 태그 동작 분석 및 404 에러 해결

## 1. 현재 상태

- ✅ DB에 NFC001이 존재 (ID: 1, Name: 벤치프레스)
- ❌ FE에서 NFC001로 API 호출하면 404 에러 발생
- ✅ 에러 메시지: "해당 기구를 찾을 수 없습니다"

---

## 2. 에러 원인 분석

### 원인: NFC 태그 값이 제대로 전달되지 않음

**BE의 StartSessionView.post() 로직:**

```python
def post(self, request, *args, **kwargs):
    nfc_tag_id = request.data.get('nfc_tag_id')  # FE에서 전달받은 값
    equipment_id = request.data.get('equipment_id')

    if not nfc_tag_id and not equipment_id:
        return Response({'error': '...'}, status=400)

    try:
        if equipment_id:
            equipment = Equipment.objects.get(id=equipment_id)
        else:
            equipment = Equipment.objects.get(nfc_tag_id=nfc_tag_id)  # ← 여기서 404 발생
    except Equipment.DoesNotExist:
        return Response({'error': '해당 기구를 찾을 수 없습니다.'}, status=404)
```

### 핵심 문제점

1. **FE에서 잘못된 데이터 형식 전송**:

   - FE가 보내는 데이터: `{ nfc_tag_id: "NFC001" }` (문자열)
   - BE에서 기대하는 데이터: 정확히 같은 형식
   - ⚠️ 문제: `NFCReader.tsx`에서 읽은 NFC 값이 올바르게 전달되지 않을 수 있음

2. **URL 인코딩 또는 공백 문제**:

   - NFC 데이터에 숨겨진 공백이나 특수문자가 있을 수 있음
   - `"NFC001 "` (뒤에 공백) ≠ `"NFC001"`

3. **BE의 로깅 부족**:
   - `nfc_tag_id` 값이 정확히 무엇인지 로그에 기록되지 않음
   - 디버깅을 위해 로깅 추가 필요

---

## 3. FE → BE 동작 흐름

### Step 1: NFCReader 컴포넌트에서 NFC 태그 읽기

```typescript
// NFCReader.tsx
ndef.onreading = (event: any) => {
  const { message } = event;

  for (const record of message.records) {
    if (record.recordType === "text") {
      const textDecoder = new TextDecoder();
      const equipmentId = textDecoder.decode(record.data); // ← "NFC001" 추출
      const trimmedId = equipmentId.trim(); // ← 공백 제거

      onTagDetected(trimmedId); // ← App.tsx의 handleNFCTagDetected 호출
    }
  }
};
```

### Step 2: App.tsx의 handleNFCTagDetected에서 API 호출

```typescript
// App.tsx
const handleNFCTagDetected = async (equipmentId: string | number) => {
  const nfcTagId = String(equipmentId); // "NFC001"

  const response = await fetch(`${apiBase}/api/workouts/start/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      nfc_tag_id: nfcTagId, // ← BE로 전송
    }),
  });
};
```

### Step 3: BE의 StartSessionView에서 처리

```python
# BE/workouts/views.py
def post(self, request, *args, **kwargs):
    nfc_tag_id = request.data.get('nfc_tag_id')  # "NFC001" 수신

    try:
        # 데이터베이스에서 nfc_tag_id로 기구 찾기
        equipment = Equipment.objects.get(nfc_tag_id=nfc_tag_id)
        # ← 여기서 Equipment 객체 반환 (ID=1, name='벤치프레스', nfc_tag_id='NFC001')
    except Equipment.DoesNotExist:
        return Response({'error': '해당 기구를 찾을 수 없습니다.'}, status=404)
```

---

## 4. 현재 발생 중인 404 에러의 실제 원인

### 가능성 1: 토큰 만료 또는 인증 실패

- `IsAuthenticated` 권한 때문에 요청이 거부될 수 있음
- BE에서 `request.user`가 None이면 404 대신 401 반환해야 함

### 가능성 2: NFC 데이터에 숨겨진 문자

- 예: `"NFC001\x00"` (null byte)
- 예: `"NFC001 "` (뒤에 공백)
- 예: `" NFC001"` (앞에 공백)

### 가능성 3: 데이터베이스 불일치

- FE는 "NFC001"을 보냈지만, BE DB에는 다른 형식 저장
- 예: DB에 "nfc001" (소문자) 저장되어 있음

### 가능성 4: 트랜잭션 Lock 문제

- `select_for_update()` 때문에 lock이 발생할 수 있음
- 다른 세션에서 equipment를 수정 중이면 timeout 발생

---

## 5. 해결 방법

### 방법 A: BE에 상세 로깅 추가 (추천)

```python
# StartSessionView.post()에 로깅 추가
logger.info(f"🔍 [StartSessionView] 수신한 nfc_tag_id: '{nfc_tag_id}' (type: {type(nfc_tag_id)})")
logger.info(f"🔍 [StartSessionView] nfc_tag_id hex: {nfc_tag_id.encode('utf-8').hex() if nfc_tag_id else 'None'}")

# 데이터베이스에 있는 모든 nfc_tag_id 로깅
all_nfc_tags = Equipment.objects.values_list('nfc_tag_id', flat=True)
logger.info(f"📋 [StartSessionView] DB의 모든 nfc_tag_id: {list(all_nfc_tags)}")
```

### 방법 B: FE에서 데이터 전송 검증

```typescript
// App.tsx handleNFCTagDetected에서 전송 전 검증
console.log(`📊 NFC 데이터 상세 정보:`);
console.log(`  - 원본: "${equipmentId}"`);
console.log(`  - Trim 후: "${nfcTagId}"`);
console.log(
  `  - Hex: ${[...nfcTagId].map((c) => c.charCodeAt(0).toString(16)).join(" ")}`
);
console.log(`  - 길이: ${nfcTagId.length}`);
```

### 방법 C: BE에서 케이스 인센서티브 검색

```python
equipment = Equipment.objects.get(nfc_tag_id__iexact=nfc_tag_id)  # 대소문자 무시
```

### 방법 D: 요청 재시도 로직 추가 (FE)

```typescript
// NFC 요청 실패 시 3번 재시도
const maxRetries = 3;
for (let i = 0; i < maxRetries; i++) {
  const response = await fetch(...);
  if (response.ok) break;
  if (i < maxRetries - 1) await new Promise(r => setTimeout(r, 1000));
}
```

---

## 6. 권장 수정 사항 (우선순위)

### 1순위: BE 로깅 추가 (즉시 실행)

- 정확한 원인 파악을 위해 필수
- `nfc_tag_id` 값과 DB 조회 결과 로깅

### 2순위: FE에서 데이터 유효성 검증 강화

- NFC 데이터가 올바른 형식인지 확인
- 특수문자나 공백 확인

### 3순위: 에러 처리 개선

- 더 상세한 에러 메시지 제공
- 재시도 로직 추가

---

## 7. 다음 단계

1. BE에 로깅 추가 후 실행
2. 디버그 로그 확인
3. 원인 파악 후 해결책 적용
