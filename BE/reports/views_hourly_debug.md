# HourlyUtilizationView 500 Error 디버깅 가이드

## 현재 문제

- `/api/utilization/hourly/?date=2025-12-02` 호출 시 500 Internal Server Error 발생

## 주요 의심 원인

### 1. 타임존 문제

```python
timezone.make_aware(datetime.combine(start_date, datetime.min.time()), timezone.get_current_timezone())
```

- `timezone.get_current_timezone()` 실패 가능
- `settings.TIME_ZONE = 'Asia/Seoul'` 확인 필요

### 2. UserProfile 조인 실패

```python
sessions.filter(user__userprofile__gender=gender_q)
```

- UserProfile이 없는 User가 세션에 있으면 예외 발생 가능
- LEFT JOIN으로 변경 필요 또는 조건 완화

### 3. 세션 없을 때 처리

- 세션이 전혀 없으면 빈 응답 반환해야 함
- 현재는 빈 리스트 순회 시 안정성 검증 필요

## 즉시 확인 방법

### 서버 로그 확인

```bash
# Gunicorn 로그 최근 500줄
sudo journalctl -u gunicorn -n 500 --no-pager | grep -i "error\|exception\|traceback" -A 10

# 최근 5분간 에러
sudo journalctl -u gunicorn --since "5 minutes ago" --no-pager

# hourly 관련 로그만
sudo journalctl -u gunicorn -n 1000 --no-pager | grep -i "hourly" -B 5 -A 20
```

### 직접 테스트 (Django shell)

```python
python manage.py shell

from django.utils import timezone
from datetime import datetime, timedelta
from equipment.models import Equipment
from workouts.models import UsageSession

# 타임존 테스트
tz_now = timezone.now()
print(f"현재 시간: {tz_now}")
print(f"현재 타임존: {timezone.get_current_timezone()}")

# 기구 수 확인
capacity = Equipment.objects.filter(operational_state='NORMAL').count()
print(f"정상 기구 수: {capacity}")

# 세션 수 확인
today = tz_now.date()
day_start = timezone.make_aware(datetime.combine(today, datetime.min.time()), timezone.get_current_timezone())
day_end = timezone.make_aware(datetime.combine(today, datetime.max.time()), timezone.get_current_timezone())

sessions = UsageSession.objects.filter(
    start_time__lt=day_end,
    end_time__gte=day_start
).count()
print(f"오늘 세션 수: {sessions}")

# UserProfile 없는 유저 확인
from django.contrib.auth.models import User
users_without_profile = User.objects.filter(userprofile__isnull=True).count()
print(f"UserProfile 없는 유저: {users_without_profile}명")

# 세션에 UserProfile 없는 유저가 있는지
bad_sessions = UsageSession.objects.filter(user__userprofile__isnull=True).count()
print(f"UserProfile 없는 유저의 세션: {bad_sessions}개")
```

## 권장 수정 사항

### 1. 전체 try-except 추가

```python
def get(self, request):
    try:
        # 전체 로직
        ...
        return Response(result)
    except Exception as e:
        logger.exception('[reports.hourly] 예외 발생')
        return Response(
            {'detail': f'시간대별 이용률 조회 실패: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
```

### 2. UserProfile 안전 처리

```python
# 기존
if gender_q:
    sessions = sessions.filter(user__userprofile__gender=gender_q)

# 수정안
if gender_q:
    sessions = sessions.filter(
        user__userprofile__isnull=False,
        user__userprofile__gender=gender_q
    )
```

### 3. 디버그 로그 추가

```python
logger.info(f'[hourly] 요청: date={date_str}, start={start_str}, end={end_str}')
logger.info(f'[hourly] 세션 수: {sessions.count()}, 기구 수: {capacity_equip}')
logger.info(f'[hourly] 결과: {len(percentages)}개 시간대')
```

## 빠른 핫픽스 (최소 변경)

파일: `BE/reports/views.py`
위치: `HourlyUtilizationView.get()` 메서드 시작 부분

```python
def get(self, request):
    try:
        logger.info(f'[hourly] 요청 시작: params={dict(request.query_params)}')
        # ... 기존 코드 ...
        logger.info(f'[hourly] 응답 준비 완료: mode={mode}, hours={len(percentages)}')
        return Response(result)
    except Exception as e:
        logger.exception('[hourly] 예외 발생')
        return Response({
            'detail': '시간대별 이용률 조회 중 오류가 발생했습니다.',
            'error': str(e) if settings.DEBUG else None
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
```

이렇게 수정 후 다시 호출하면 로그에 정확한 에러가 찍힙니다.
