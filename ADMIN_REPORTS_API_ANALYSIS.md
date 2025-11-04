# 운영자 대시보드 신고 목록 API 연동 분석

## 📋 현재 상태 (FE)

### AdminDashboard.tsx의 Report 인터페이스

```typescript
interface Report {
  id: string;
  type: "equipment" | "user"; // FE에서 사용하는 분류
  equipment: string; // 기구 이름
  reporter: string; // 신고자 이름
  description: string; // 신고 내용
  status: "pending" | "resolved"; // 처리 상태
  timestamp: string; // 신고 시각
}
```

### 현재 Mock 데이터

```typescript
const [reports] = useState<Report[]>([
  {
    id: "1",
    type: "equipment",
    equipment: "러닝머신 2",
    reporter: "김철수",
    description: "벨트가 미끄러져서 위험합니다",
    status: "pending",
    timestamp: "2024-01-15 14:30",
  },
  // ... 더 많은 mock 데이터
]);
```

---

## 🔗 백엔드 API 구조

### 1. Report Model (`BE/reports/models.py`)

```python
class Report(models.Model):
    reporter = ForeignKey(User)              # 신고한 사람
    reported_user = ForeignKey(User)         # 신고된 사람
    equipment = ForeignKey(Equipment)        # 관련 기구 (nullable)
    reason = TextField()                     # 신고 사유

    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('RESOLVED', 'Resolved'),
    ]
    status = CharField(max_length=20, default='PENDING')
    created_at = DateTimeField(auto_now_add=True)
```

### 2. API 엔드포인트

**기본 URL**: `http://43.201.88.27/api/reports/`

**ViewSet**: `ReportViewSet` (ModelViewSet)

- 인증 필요: `IsAuthenticated`
- 제공하는 표준 REST 엔드포인트:

| 메서드    | 엔드포인트           | 설명                | 용도               |
| --------- | -------------------- | ------------------- | ------------------ |
| GET       | `/api/reports/`      | 모든 신고 목록 조회 | 대시보드 신고 목록 |
| GET       | `/api/reports/{id}/` | 특정 신고 상세 조회 | 신고 상세 정보     |
| POST      | `/api/reports/`      | 새 신고 생성        | 사용자가 신고하기  |
| PUT/PATCH | `/api/reports/{id}/` | 신고 정보 수정      | 상태 변경 등       |
| DELETE    | `/api/reports/{id}/` | 신고 삭제           | 신고 삭제          |

### 3. Serializer 응답 형식

```python
class ReportSerializer(serializers.ModelSerializer):
    reporter = serializers.ReadOnlyField(source='reporter.username')
    reported_user = serializers.ReadOnlyField(source='reported_user.username')

    class Meta:
        model = Report
        fields = '__all__'
```

**예상 응답 JSON**:

```json
[
  {
    "id": 1,
    "reporter": "김철수", // username
    "reported_user": "박영희", // username
    "equipment": 3, // Equipment ID
    "reason": "시간 초과했는데 계속 사용 중",
    "status": "PENDING",
    "created_at": "2024-01-15T14:30:00Z"
  }
  // ...
]
```

---

## 🔄 필요한 매핑 작업

### FE ↔ BE 필드 매핑

| FE 필드       | BE 필드               | 변환 필요 사항              |
| ------------- | --------------------- | --------------------------- |
| `id`          | `id`                  | 문자열 ↔ 숫자 변환          |
| `type`        | _없음_                | **FE에서 추론 필요**        |
| `equipment`   | `equipment` (ID)      | **Equipment API 조회 필요** |
| `reporter`    | `reporter` (username) | 그대로 사용                 |
| `description` | `reason`              | 필드명만 다름               |
| `status`      | `status`              | 대소문자 변환 필요          |
| `timestamp`   | `created_at`          | 날짜 포맷 변환              |
| _없음_        | `reported_user`       | **추가 정보**               |

### 주요 이슈

1. **`type` 필드 부재**

   - BE에는 "equipment" vs "user" 구분이 없음
   - FE에서 다음 로직으로 추론 가능:
     ```typescript
     type = equipment !== null ? "equipment" : "user";
     ```

2. **Equipment 정보**

   - BE는 `equipment` ID만 반환
   - 기구 이름을 얻으려면:
     - Option A: `/api/equipment/{id}/` 추가 조회
     - Option B: **BE Serializer 수정** (권장)

3. **Status 대소문자**
   - BE: `"PENDING"`, `"RESOLVED"` (대문자)
   - FE: `"pending"`, `"resolved"` (소문자)
   - 변환 필요

---

## 💡 권장 구현 방안

### 방안 1: FE에서 변환 처리 (빠른 구현)

```typescript
// AdminDashboard.tsx
useEffect(() => {
  const fetchReports = async () => {
    try {
      const token = localStorage.getItem("access_token");
      const response = await fetch("http://43.201.88.27/api/reports/", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      // BE 데이터를 FE 형식으로 변환
      const transformedReports = await Promise.all(
        data.map(async (report: any) => {
          // Equipment 이름 가져오기
          let equipmentName = "";
          if (report.equipment) {
            const equipRes = await fetch(
              `http://43.201.88.27/api/equipment/${report.equipment}/`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            const equipData = await equipRes.json();
            equipmentName = equipData.name;
          }

          return {
            id: report.id.toString(),
            type: report.equipment ? "equipment" : "user",
            equipment: equipmentName || "기구 없음",
            reporter: report.reporter,
            description: report.reason,
            status: report.status.toLowerCase(),
            timestamp: new Date(report.created_at).toLocaleString("ko-KR"),
          };
        })
      );

      setReports(transformedReports);
    } catch (error) {
      console.error("신고 목록 조회 실패:", error);
    }
  };

  fetchReports();
}, []);
```

**장점**: 빠르게 구현 가능  
**단점**: N+1 쿼리 문제 (Equipment API 여러 번 호출)

---

### 방안 2: BE Serializer 수정 (권장)

#### BE 수정: `reports/serializers.py`

```python
from rest_framework import serializers
from .models import Report

class ReportSerializer(serializers.ModelSerializer):
    reporter = serializers.ReadOnlyField(source='reporter.username')
    reported_user = serializers.ReadOnlyField(source='reported_user.username')
    equipment_name = serializers.SerializerMethodField()  # 추가

    class Meta:
        model = Report
        fields = ['id', 'reporter', 'reported_user', 'equipment',
                  'equipment_name', 'reason', 'status', 'created_at']

    def get_equipment_name(self, obj):
        return obj.equipment.name if obj.equipment else None
```

이렇게 하면 응답에 `equipment_name`이 포함됨:

```json
{
  "id": 1,
  "reporter": "김철수",
  "reported_user": "박영희",
  "equipment": 3,
  "equipment_name": "러닝머신 2", // ← 추가됨
  "reason": "시간 초과",
  "status": "PENDING",
  "created_at": "2024-01-15T14:30:00Z"
}
```

#### FE 구현: `AdminDashboard.tsx`

```typescript
useEffect(() => {
  const fetchReports = async () => {
    try {
      const token = localStorage.getItem("access_token");
      const response = await fetch("http://43.201.88.27/api/reports/", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      const transformedReports = data.map((report: any) => ({
        id: report.id.toString(),
        type: report.equipment ? "equipment" : "user",
        equipment: report.equipment_name || "기구 없음",
        reporter: report.reporter,
        description: report.reason,
        status: report.status.toLowerCase() as "pending" | "resolved",
        timestamp: new Date(report.created_at).toLocaleString("ko-KR"),
      }));

      setReports(transformedReports);
    } catch (error) {
      console.error("신고 목록 조회 실패:", error);
    }
  };

  fetchReports();
}, []);
```

**장점**:

- 단일 API 호출로 모든 정보 획득
- 성능 최적화
- 명확한 책임 분리

**단점**:

- BE 수정 필요

---

## 🔧 추가 기능 구현

### 신고 처리하기 (상태 변경)

```typescript
const handleResolveReport = async (reportId: string) => {
  try {
    const token = localStorage.getItem("access_token");
    await fetch(`http://43.201.88.27/api/reports/${reportId}/`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "RESOLVED" }),
    });

    // 목록 새로고침
    fetchReports();
  } catch (error) {
    console.error("신고 처리 실패:", error);
  }
};
```

### 필터링 (운영자의 헬스장 신고만)

**BE에 필터 추가** (`reports/views.py`):

```python
class ReportViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = ReportSerializer

    def get_queryset(self):
        # 운영자가 관리하는 헬스장의 신고만 필터링
        user = self.request.user
        if user.is_staff:
            # 운영자가 속한 헬스장의 신고만
            return Report.objects.filter(
                equipment__gym__membership__user=user
            )
        return Report.objects.none()
```

---

## 📝 구현 체크리스트

### Phase 1: 기본 연동

- [ ] BE Serializer에 `equipment_name` 필드 추가
- [ ] FE에서 `/api/reports/` 호출 구현
- [ ] Mock 데이터를 실제 API 데이터로 교체
- [ ] 날짜/시간 포맷 변환 구현
- [ ] Status 대소문자 변환 구현

### Phase 2: 상호작용

- [ ] "처리하기" 버튼 클릭 시 PATCH 요청 구현
- [ ] 처리 완료 후 목록 새로고침
- [ ] 로딩/에러 상태 처리

### Phase 3: 최적화

- [ ] BE에서 헬스장별 필터링 구현
- [ ] 페이지네이션 추가 (신고가 많을 경우)
- [ ] 실시간 업데이트 (WebSocket 또는 폴링)

---

## 🎯 결론

**운영자 대시보드의 신고 목록은 다음 API와 연동되어야 합니다:**

- **엔드포인트**: `GET /api/reports/`
- **인증**: Bearer Token (access_token)
- **응답**: Report 객체 배열

**권장 구현 순서**:

1. BE Serializer 수정 (`equipment_name` 추가)
2. FE에서 API 호출 및 데이터 변환
3. 상태 변경 기능 구현 (PATCH)
4. 헬스장별 필터링 추가

이렇게 하면 운영자 대시보드에서 실제 신고 데이터를 표시하고 관리할 수 있습니다.
