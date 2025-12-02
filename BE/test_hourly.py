#!/usr/bin/env python
"""
HourlyUtilizationView 디버깅 스크립트
서버에서 실행: python manage.py shell < test_hourly.py
"""
import os
import sys
import django

# Django 설정
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.utils import timezone
from datetime import datetime, timedelta
from equipment.models import Equipment
from workouts.models import UsageSession
from django.db.models import Q

print("=" * 60)
print("HourlyUtilizationView 디버깅 스크립트")
print("=" * 60)

try:
    tz_now = timezone.now()
    print(f"\n1. 현재 시간: {tz_now}")
    
    # 파라미터 설정
    date_str = None
    day_date = tz_now.date()
    start_date = day_date
    end_date = day_date
    days = 1
    mode = "single"
    print(f"2. 날짜 범위: {start_date} ~ {end_date} (mode={mode})")
    
    # NORMAL 기구 수
    capacity_equip = Equipment.objects.filter(operational_state='NORMAL').count()
    print(f"3. NORMAL 기구 수: {capacity_equip}")
    
    if capacity_equip == 0:
        capacity_equip = 1
        print(f"   -> 분모 0 방지, capacity={capacity_equip}")
    
    # 세션 쿼리 범위
    day_start_dt = timezone.make_aware(
        datetime.combine(start_date, datetime.min.time()),
        timezone.get_current_timezone()
    )
    day_end_dt = timezone.make_aware(
        datetime.combine(end_date, datetime.max.time()),
        timezone.get_current_timezone()
    )
    print(f"4. 쿼리 범위: {day_start_dt} ~ {day_end_dt}")
    
    # 세션 쿼리
    sessions = UsageSession.objects.filter(
        start_time__lt=day_end_dt,
    ).filter(
        Q(end_time__gte=day_start_dt) | Q(end_time__isnull=True)
    )
    session_count = sessions.count()
    print(f"5. 세션 수: {session_count}")
    
    # 시간대별 분 누적
    totals = [0.0] * 24
    print(f"6. 시간대 배열 초기화: 24개 슬롯")
    
    # 범위 내 각 날짜 슬롯
    cur_date = start_date
    slot_map_per_day = {}
    tz = timezone.get_current_timezone()
    
    def _hour_slots(midnight_dt):
        """24시간 슬롯 생성"""
        return [
            (i, midnight_dt + timedelta(hours=i), midnight_dt + timedelta(hours=i+1))
            for i in range(24)
        ]
    
    def _overlap_minutes(s_start, s_end, h_start, h_end):
        """두 시간 범위의 겹치는 분 계산"""
        overlap_start = max(s_start, h_start)
        overlap_end = min(s_end, h_end)
        if overlap_start >= overlap_end:
            return 0
        delta = overlap_end - overlap_start
        return delta.total_seconds() / 60.0
    
    while cur_date <= end_date:
        midnight = timezone.make_aware(datetime.combine(cur_date, datetime.min.time()), tz)
        slot_map_per_day[cur_date] = _hour_slots(midnight)
        cur_date += timedelta(days=1)
    
    print(f"7. 날짜별 슬롯 맵 생성: {len(slot_map_per_day)}일")
    
    # 세션 반복
    processed = 0
    for s in sessions.only('start_time', 'end_time'):
        s_start = s.start_time
        s_end = s.end_time or tz_now
        
        # 범위 벗어나면 클램프
        if s_end < day_start_dt or s_start > day_end_dt:
            continue
        if s_start < day_start_dt:
            s_start = day_start_dt
        if s_end > day_end_dt:
            s_end = day_end_dt
        
        # 날짜별 시간대에 겹친 분 합산
        cur = s_start.date()
        while cur <= s_end.date():
            slots = slot_map_per_day.get(cur)
            if not slots:
                cur += timedelta(days=1)
                continue
            for idx, h_start, h_end in slots:
                minutes = _overlap_minutes(s_start, s_end, h_start, h_end)
                if minutes > 0:
                    totals[idx] += minutes
            cur += timedelta(days=1)
        processed += 1
    
    print(f"8. 세션 처리 완료: {processed}개")
    
    # 퍼센트 계산
    denom = capacity_equip * 60.0 * (days if mode == 'range' else 1)
    percentages = [round((m / denom) * 100.0, 1) for m in totals]
    print(f"9. 분모: {denom} (기구={capacity_equip}, 분=60, 일수={days})")
    
    # 미래 시간 null 처리
    if mode == 'single':
        current_hour = timezone.localtime(tz_now).hour
        for h in range(current_hour + 1, 24):
            percentages[h] = None
        print(f"10. 현재 시각: {current_hour}시, 미래 슬롯 null 처리")
    
    result = {
        'mode': mode,
        'date': start_date.isoformat(),
        'hours': percentages,
        'capacity_equipment': capacity_equip,
    }
    
    print(f"\n{'='*60}")
    print("✅ 성공: 결과 생성됨")
    print(f"{'='*60}")
    print(f"hours 배열 (처음 10개): {percentages[:10]}")
    print(f"null이 아닌 시간대 수: {sum(1 for p in percentages if p is not None)}")
    
except Exception as e:
    print(f"\n{'='*60}")
    print(f"❌ 예외 발생: {type(e).__name__}")
    print(f"{'='*60}")
    print(f"메시지: {str(e)}")
    import traceback
    print("\n전체 스택 트레이스:")
    traceback.print_exc()
