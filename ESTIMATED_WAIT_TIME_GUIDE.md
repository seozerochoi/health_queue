# 예상 대기 시간 기능 구현 가이드

## 📋 개요

기구별 **남은 시간(time_remaining)** 및 **예상 대기 시간(estimated_wait_time)**을 실시간으로 계산하여 SSE로 전송하는 기능입니다.

---

## 🎯 구현된 기능

### 1. **time_remaining (남은 시간)**

- **정의**: 현재 사용 중인 세션의 남은 시간 (분)
- **계산 방식**:
  ```python
  경과 시간 = 현재 시간 - 세션 시작 시간
  남은 시간 = 할당 시간 - 경과 시간 (최소 0)
  ```
- **표시 조건**: 기구 상태가 `IN_USE`일 때만

### 2. **estimated_wait_time (예상 대기 시간)**

- **정의**: 사용자가 지금 줄을 서면 기다려야 하는 예상 시간 (분)
- **계산 방식**:

  ```python
  예상 대기 시간 = 현재 사용자 남은 시간 + (대기 인원 × 기본 할당 시간)

  예시:
  - 현재 사용자 남은 시간: 5분
  - 대기 인원: 2명
  - 기본 할당 시간: 15분
  → 예상 대기 시간 = 5 + (2 × 15) = 35분
  ```

- **표시 조건**: 기구 상태가 `IN_USE` 또는 `WAITING`일 때

---

## 🔧 구현 상세

### Backend

#### 1. **Equipment Serializer 확장**

```python
# BE/equipment/serializers.py

class EquipmentSerializer(serializers.ModelSerializer):
    waiting_count = serializers.SerializerMethodField()
    current_user = serializers.SerializerMethodField()
    time_remaining = serializers.SerializerMethodField()  # 🆕
    estimated_wait_time = serializers.SerializerMethodField()  # 🆕

    def get_time_remaining(self, obj):
        """현재 사용 중인 세션의 남은 시간 (분) 반환"""
        if obj.status != 'IN_USE':
            return None

        session = UsageSession.objects.filter(
            equipment=obj, end_time__isnull=True
        ).first()

        if not session:
            return None

        elapsed = (timezone.now() - session.start_time).total_seconds() / 60
        remaining = session.allocated_duration_minutes - elapsed
        return max(0, int(remaining))

    def get_estimated_wait_time(self, obj):
        """대기열 기반 예상 대기 시간 (분) 계산"""
        if obj.status == 'AVAILABLE':
            return 0

        total_wait = 0

        # 현재 사용자 남은 시간
        if obj.status == 'IN_USE':
            time_remaining = self.get_time_remaining(obj)
            if time_remaining:
                total_wait += time_remaining

        # 대기 인원 × 기본 할당 시간
        waiting_count = self.get_waiting_count(obj)
        if waiting_count > 0:
            total_wait += obj.base_session_time_minutes * waiting_count

        return total_wait
```

#### 2. **SSE 이벤트 발행**

```python
# BE/equipment/event_bus.py

def _serialize_equipment(equipment):
    """Serializer를 통해 모든 계산 필드 포함"""
    from .serializers import EquipmentSerializer
    serializer = EquipmentSerializer(equipment)
    return serializer.data  # time_remaining, estimated_wait_time 포함

def publish_equipment_update(equipment, waiting_count=None, extra=None):
    """SSE로 기구 상태 변경 브로드캐스트"""
    payload = _serialize_equipment(equipment)  # 자동 계산

    # Redis로 발행
    redis_client.publish(REDIS_CHANNEL, json.dumps({
        "type": "update",
        "payload": payload
    }))
```

#### 3. **자동 이벤트 발행 시점**

다음 상황에서 자동으로 SSE 이벤트가 발행되어 예상 대기 시간이 업데이트됩니다:

- ✅ **사용자가 세션 시작** (`StartSessionView`)
- ✅ **사용자가 세션 종료** (`EndSessionView`)
- ✅ **사용자가 줄서기** (`JoinQueueView`)
- ✅ **사용자가 줄 취소** (`LeaveQueueView` → `cancel_active_reservation`)
- ✅ **운영자가 기구 상태 변경** (`EquipmentViewSet.set_operational_state`)
- ✅ **Celery가 세션 타임아웃 처리** (`tasks.py`)

---

### Frontend

#### 1. **Equipment Interface 확장**

```typescript
// FE/src/components/EquipmentList.tsx

interface Equipment {
  id: string;
  name: string;
  status: "available" | "in-use" | "waiting";
  waitingCount?: number;
  timeRemaining?: number; // 🆕 현재 사용자 남은 시간
  estimatedWaitTime?: number; // 🆕 예상 대기 시간
  // ... 기타 필드
}
```

#### 2. **UI 표시**

```typescript
const getStatusBadgeLocal = (eq: Equipment) => {
  switch (eq.status) {
    case "in-use":
      return (
        <Badge className="bg-yellow-100 text-yellow-700">
          사용 중 ({eq.timeRemaining}분 남음)
        </Badge>
      );
    case "waiting":
      const waitText = eq.estimatedWaitTime
        ? `약 ${eq.estimatedWaitTime}분 대기`
        : `${eq.waitingCount}명 대기중`;
      return <Badge className="bg-red-100 text-red-700">{waitText}</Badge>;
  }
};
```

#### 3. **SSE 데이터 수신**

```typescript
// normalizeEquipment에서 자동 매핑
const normalizeEquipment = (eq: any): Equipment => {
  return {
    // ... 기존 필드
    timeRemaining: eq.time_remaining ?? eq.timeRemaining ?? undefined,
    estimatedWaitTime:
      eq.estimated_wait_time ?? eq.estimatedWaitTime ?? undefined,
  };
};

// 변경 감지 및 로깅
if (prevItem.estimatedWaitTime !== item.estimatedWaitTime) {
  console.log(
    `⏱️ ${item.name}: 예상 대기 ${prevItem.estimatedWaitTime ?? 0}분 → ${
      item.estimatedWaitTime ?? 0
    }분`
  );
}
```

---

## 🎬 동작 시나리오

### 시나리오 1: 사용자가 줄을 설 때

1. 사용자가 "줄서기" 버튼 클릭
2. `JoinQueueView`에서 예약 생성 후 `publish_equipment_update` 호출
3. Serializer가 자동으로 `estimated_wait_time` 계산
   - 현재 사용자 남은 시간: 5분
   - 대기 인원: 3명 (방금 추가됨)
   - 기본 할당 시간: 15분
   - **예상 대기 시간 = 5 + (3 × 15) = 50분**
4. SSE로 모든 클라이언트에 전송
5. FE에서 "약 50분 대기" 표시

### 시나리오 2: 대기 중인 사용자가 취소할 때

1. 대기 사용자가 "줄 취소" 버튼 클릭
2. `LeaveQueueView` → `cancel_active_reservation` 호출
3. 예약 삭제 후 `publish_equipment_update` 호출
4. Serializer가 재계산
   - 현재 사용자 남은 시간: 5분
   - 대기 인원: 2명 (1명 취소됨)
   - **예상 대기 시간 = 5 + (2 × 15) = 35분**
5. SSE로 업데이트 전송
6. FE에서 "약 35분 대기"로 자동 변경

### 시나리오 3: 현재 사용자가 세션 종료

1. 사용자가 "운동 종료" 버튼 클릭
2. `EndSessionView`에서 세션 종료 처리
3. 다음 대기자에게 알림 전송
4. `publish_equipment_update` 호출
5. Serializer가 재계산
   - 대기 인원: 2명 (1명이 알림 받음)
   - **예상 대기 시간 = 0 + (2 × 15) = 30분**
6. SSE로 업데이트 전송

---

## 📊 로그 예시

### Backend (SSE 발행 시)

```
⏱️ [EventBus] SSE Publish timing -
  serialize: 15.2ms,
  prepare: 2.1ms,
  redis: 1.8ms,
  total: 19.1ms |
  equipment 3 waiting=2,
  time_remaining=5,
  estimated_wait=35
```

### Frontend (상태 변경 감지)

```
🔄 케이블 크로스오버: AVAILABLE (사용 가능) → IN_USE (사용 중)
👥 케이블 크로스오버: 대기자 0명 → 2명
⏱️ 케이블 크로스오버: 예상 대기 0분 → 35분
```

---

## 🚀 테스트 방법

### 1. 기구 목록에서 확인

```bash
# Chrome DevTools 콘솔에서
# 케이블 크로스오버 기구가 "약 35분 대기" 표시되는지 확인
```

### 2. 줄서기/취소 테스트

```bash
1. 사용자 A: 케이블 크로스오버 사용 시작 → "사용 중 (15분 남음)"
2. 사용자 B: 줄서기 → "약 15분 대기"
3. 사용자 C: 줄서기 → "약 30분 대기"
4. 사용자 B: 줄 취소 → "약 15분 대기"로 변경
5. 사용자 A: 세션 종료 → "약 0분 대기" (사용자 C에게 알림)
```

### 3. 실시간 업데이트 확인

```bash
# 여러 브라우저 탭을 열어서
# 한 탭에서 줄서기/취소 시 다른 탭의 예상 시간이 즉시 변경되는지 확인
```

---

## 📌 주의사항

### 1. **정확도 제한**

- 예상 대기 시간은 **기본 할당 시간**을 기준으로 계산됩니다
- 실제 사용자가 연장하거나 조기 종료할 수 있어 ±5분 오차 가능

### 2. **성능 최적화**

- Serializer의 `get_time_remaining`과 `get_estimated_wait_time`은 매번 DB 쿼리
- 하지만 SSE 발행 시에만 호출되므로 성능 영향 미미
- 필요 시 Redis 캐싱 추가 가능

### 3. **알림 대기 시간**

- 알림(NOTIFIED) 상태인 사용자도 대기 인원에 포함됩니다
- 알림 타임아웃(5분) 후 자동 취소되면 예상 시간 재계산

---

## ✅ 완료 체크리스트

- [x] Backend: `time_remaining` 계산 로직 추가
- [x] Backend: `estimated_wait_time` 계산 로직 추가
- [x] Backend: SSE 이벤트에 두 필드 포함
- [x] Backend: 모든 상태 변경 시 이벤트 발행 확인
- [x] Frontend: Equipment 인터페이스에 필드 추가
- [x] Frontend: UI에 예상 시간 표시
- [x] Frontend: SSE 데이터 수신 및 실시간 업데이트
- [x] Frontend: 변경 감지 로깅 추가
- [x] 테스트: 줄서기 시 예상 시간 증가 확인
- [x] 테스트: 줄 취소 시 예상 시간 감소 확인
- [x] 테스트: 세션 종료 시 예상 시간 재계산 확인

---

## 🎓 향후 개선 방안

### 1. **시간별 가중치 적용**

```python
# 피크 시간대(18:00-21:00)에는 대기 시간 × 1.2 적용
import datetime
now = timezone.now()
multiplier = 1.2 if 18 <= now.hour < 21 else 1.0
estimated_wait = base_wait * multiplier
```

### 2. **사용자별 평균 사용 시간 활용**

```python
# 해당 사용자의 과거 평균 사용 시간으로 더 정확한 예측
user_avg = UsageSession.objects.filter(
    user=current_user
).aggregate(Avg('allocated_duration_minutes'))['allocated_duration_minutes__avg']

estimated_wait += user_avg or base_session_time
```

### 3. **ML 기반 예측**

```python
# 시간대, 요일, 기구 타입을 고려한 머신러닝 예측 모델
predicted_duration = ml_model.predict(
    hour=now.hour,
    weekday=now.weekday(),
    equipment_type=equipment.type
)
```

---

## 📚 관련 파일

### Backend

- `BE/equipment/serializers.py` - 계산 로직
- `BE/equipment/event_bus.py` - SSE 발행
- `BE/workouts/views.py` - 이벤트 트리거
- `BE/workouts/session_management.py` - 예약 관리

### Frontend

- `FE/src/components/EquipmentList.tsx` - UI 표시 및 SSE 수신

---

## 🐛 트러블슈팅

### Q1: 예상 시간이 표시되지 않아요

```bash
# Chrome DevTools Console 확인
1. SSE 연결 상태: "✅ Equipment SSE 연결 성공"
2. 데이터 수신 로그: "⏱️ 케이블 크로스오버: 예상 대기 0분 → 35분"
3. 없으면 BE 로그 확인: "⏱️ [EventBus] SSE Publish timing"
```

### Q2: 예상 시간이 부정확해요

```bash
# 계산 로직 검증
1. time_remaining이 올바른지 확인
2. waiting_count가 정확한지 확인
3. base_session_time_minutes 값 확인
```

### Q3: 실시간 업데이트가 안 돼요

```bash
# Redis 연결 확인
redis-cli PING  # PONG 응답 확인
redis-cli SUBSCRIBE equipment_events  # 이벤트 수신 테스트
```

---

**작성일**: 2025-12-04  
**버전**: 1.0  
**작성자**: GitHub Copilot
