from django.shortcuts import render
# reports/views.py

from rest_framework import viewsets, status
# IsAuthenticated를 import 합니다.
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from rest_framework.response import Response
from .models import Report
from .serializers import ReportSerializer
import logging
from django.utils import timezone
from datetime import datetime, timedelta
from django.db import models
from workouts.models import UsageSession
from equipment.models import Equipment
from reports.models import EquipmentDailyStats
from django.core.cache import cache

logger = logging.getLogger(__name__)


class ReportViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated] # <- 이 줄 추가
    queryset = Report.objects.all()
    serializer_class = ReportSerializer
    
    def perform_create(self, serializer):
        # 신고를 생성할 때 자동으로 reporter를 현재 로그인한 사용자로 설정
        report = serializer.save(reporter=self.request.user)
        
        # 운영자에게 SSE 알림 전송
        try:
            from equipment.event_bus import publish_operator_notification
            
            payload = {
                'report_id': report.id,
                'reporter_id': report.reporter.id,
                'reporter_username': report.reporter.username,
                'report_type': report.report_type,
                'reason': report.reason,
                'status': report.status,
                'created_at': report.created_at.isoformat(),
            }
            
            # equipment 관련 정보 추가
            if report.equipment:
                payload['equipment_id'] = report.equipment.id
                payload['equipment_name'] = report.equipment.name
                payload['gym_id'] = report.equipment.gym.id
                payload['gym_name'] = report.equipment.gym.name
            
            # reported_user 정보 추가
            if report.reported_user:
                payload['reported_user_id'] = report.reported_user.id
                payload['reported_user_username'] = report.reported_user.username
            
            publish_operator_notification('report_created', payload)
            logger.info(f"📢 [Report] 운영자 알림 발송: report_id={report.id}, type={report.report_type}")
        except Exception as e:
            logger.exception(f"❌ [Report] 운영자 알림 발송 실패: {e}")
            # 알림 실패해도 신고는 정상 생성


class HourlyUtilizationView(APIView):
    """
    시간대별 이용률 통계 API

    기본: 오늘 0-23시 중 현재 시간까지의 이용률을 분 단위로 계산하여 퍼센트(%)로 반환하고,
    이후 시간은 null로 채웁니다.

        쿼리 파라미터:
      - date=YYYY-MM-DD            특정 날짜의 시간대별 이용률(0-23)
      - start_date=YYYY-MM-DD      기간 평균 시작일 (end_date와 함께 사용)
      - end_date=YYYY-MM-DD        기간 평균 종료일 (포함). 최대 31일 범위
      - gender=Male|Female         필터 (대소문자 무시, '남성'/'여성'도 허용)
      - age_min, age_max           필터 (정수)
            - subcategories=comma list   특정 세부 부위(subcategory)만 포함 (예: CHEST_PRESS_MAIN,CHEST_FLY)
            - breakdown=gender,age,subcategory,muscle_group  추가 분해 반환 (복수 가능)

        muscle_group 분류 규칙:
            CHEST: CHEST_PRESS_MAIN, CHEST_PRESS_UPPER, CHEST_FLY
            BACK: BACK_PULL_VERTICAL, BACK_ROW_HORIZONTAL
            SHOULDER: SHOULDER_PRESS, SHOULDER_SIDE
            LEG: LEG_PRESS_MAIN, LEG_EXTENSION, LEG_CURL
            OTHER: 그 외 또는 미지정

    계산 방법:
      - 각 UsageSession의 [start_time, end_time]과 시간 슬롯 [h:00, h+1:00) 간 겹치는 분수를 합산
      - 분모는 운영 상태 NORMAL인 기구 수 × 60분 × 날짜 수(기간 평균 시)
      - 퍼센트 = (사용 분 / 분모) × 100
    """

    permission_classes = [IsAuthenticated]

    def _parse_date(self, s: str):
        try:
            return datetime.strptime(s, "%Y-%m-%d").date()
        except Exception:
            return None

    def _normalize_gender(self, g: str):
        if not g:
            return None
        gl = g.strip().lower()
        if gl in ("male", "m", "남", "남성"):
            return "Male"
        if gl in ("female", "f", "여", "여성"):
            return "Female"
        return None

    def _overlap_minutes(self, a_start, a_end, b_start, b_end):
        # 모든 시간은 aware datetime으로 가정
        start = max(a_start, b_start)
        end = min(a_end, b_end)
        if end <= start:
            return 0.0
        return (end - start).total_seconds() / 60.0

    def _hour_slots(self, day_start):
        # day_start: timezone-aware midnight
        slots = []
        for h in range(24):
            s = day_start + timedelta(hours=h)
            e = s + timedelta(hours=1)
            slots.append((h, s, e))
        return slots

    def get(self, request):
        tz_now = timezone.now()
        date_str = request.query_params.get("date")
        start_str = request.query_params.get("start_date")
        end_str = request.query_params.get("end_date")
        gender_q = self._normalize_gender(request.query_params.get("gender"))
        age_min = request.query_params.get("age_min")
        age_max = request.query_params.get("age_max")
        breakdown = (request.query_params.get("breakdown") or "").strip()
        breakdown_set = {b.strip().lower() for b in breakdown.split(',') if b.strip()}
        subcat_param = request.query_params.get('subcategories') or ''
        requested_subcats = [s.strip() for s in subcat_param.split(',') if s.strip()]

        # 유효 subcategory 세트 (Equipment 모델 정의와 일치해야 함)
        VALID_SUBCATS = {
            'CHEST_PRESS_MAIN','CHEST_PRESS_UPPER','CHEST_FLY',
            'BACK_PULL_VERTICAL','BACK_ROW_HORIZONTAL',
            'LEG_PRESS_MAIN','LEG_EXTENSION','LEG_CURL',
            'SHOULDER_PRESS','SHOULDER_SIDE'
        }
        if requested_subcats and not all(s in VALID_SUBCATS for s in requested_subcats):
            return Response({'detail': 'subcategories 값 중 유효하지 않은 항목이 있습니다.'}, status=status.HTTP_400_BAD_REQUEST)

        # 기간 판별
        if start_str and end_str:
            start_date = self._parse_date(start_str)
            end_date = self._parse_date(end_str)
            if not start_date or not end_date or end_date < start_date:
                return Response({"detail": "start_date/end_date 형식 또는 범위가 올바르지 않습니다"}, status=status.HTTP_400_BAD_REQUEST)
            days = (end_date - start_date).days + 1
            if days > 31:
                return Response({"detail": "기간은 최대 31일까지 허용됩니다"}, status=status.HTTP_400_BAD_REQUEST)
            mode = "range"
        else:
            # 단일 날짜: 명시되면 그 날짜, 아니면 오늘
            day_date = self._parse_date(date_str) or tz_now.date()
            start_date = day_date
            end_date = day_date
            days = 1
            mode = "single"

        # 용량(분모): NORMAL 장비 수
        capacity_equip = Equipment.objects.filter(operational_state='NORMAL').count()
        if capacity_equip == 0:
            # 분모 0 방지
            capacity_equip = 1

        # 세션 쿼리 범위
        day_start_dt = timezone.make_aware(datetime.combine(start_date, datetime.min.time()), timezone.get_current_timezone())
        day_end_dt = timezone.make_aware(datetime.combine(end_date, datetime.max.time()), timezone.get_current_timezone())

        # end_time NULL(진행 중) 세션은 now로 간주
        # select_related와 only()를 함께 사용하면 FieldError 발생하므로 제거
        sessions = UsageSession.objects.filter(
            start_time__lt=day_end_dt,
        ).filter(
            models.Q(end_time__gte=day_start_dt) | models.Q(end_time__isnull=True)
        )

        # subcategory 필터
        if requested_subcats:
            sessions = sessions.filter(equipment__subcategory__in=requested_subcats)

        # 인구통계 필터 적용
        if gender_q:
            sessions = sessions.filter(user__userprofile__gender=gender_q)
        try:
            if age_min is not None:
                age_min_v = int(age_min)
                sessions = sessions.filter(user__userprofile__age__gte=age_min_v)
            if age_max is not None:
                age_max_v = int(age_max)
                sessions = sessions.filter(user__userprofile__age__lte=age_max_v)
        except Exception:
            pass

        # 시간대별 사용 기구 집합 (세트로 중복 제거)
        hour_equipment_sets = [set() for _ in range(24)]

        # 범위 내 각 날짜에 대한 슬록 구성
        cur_date = start_date
        slot_map_per_day = {}
        tz = timezone.get_current_timezone()
        while cur_date <= end_date:
            midnight = timezone.make_aware(datetime.combine(cur_date, datetime.min.time()), tz)
            slot_map_per_day[cur_date] = self._hour_slots(midnight)
            cur_date += timedelta(days=1)

        # 세션 반복: 해당 시간대에 기구를 사용했으면 카운트
        for s in sessions.only('start_time', 'end_time', 'equipment_id'):
            s_start = s.start_time
            s_end = s.end_time or tz_now
            equip_id = s.equipment_id
            
            # 세션이 범위를 벗어나면 클램프
            if s_end < day_start_dt or s_start > day_end_dt:
                continue
            if s_start < day_start_dt:
                s_start = day_start_dt
            if s_end > day_end_dt:
                s_end = day_end_dt

            # 날짜별 시간대에 겹치면 해당 기구 ID를 집합에 추가
            cur = s_start.date()
            while cur <= s_end.date():
                slots = slot_map_per_day.get(cur)
                if not slots:
                    cur += timedelta(days=1)
                    continue
                for idx, h_start, h_end in slots:
                    # 1초라도 겹치면 해당 시간대에 사용한 것으로 간주
                    if self._overlap_minutes(s_start, s_end, h_start, h_end) > 0:
                        hour_equipment_sets[idx].add(equip_id)
                cur += timedelta(days=1)

        # 퍼센트 계산: (사용된 기구 수 / 전체 기구 수) * 100
        # range 모드에서는 일수로 나눔 (평균)
        divisor = days if mode == 'range' else 1
        percentages = [
            round((len(equip_set) / divisor / capacity_equip) * 100.0, 1) 
            for equip_set in hour_equipment_sets
        ]

        # 기본 모드에서 미래 시간은 null 처리
        if mode == 'single':
            current_hour = timezone.localtime(tz_now).hour
            for h in range(current_hour + 1, 24):
                percentages[h] = None

        result = {
            'mode': mode,
            'date': start_date.isoformat() if mode == 'single' else None,
            'range': {'start': start_date.isoformat(), 'end': end_date.isoformat()} if mode == 'range' else None,
            'hours': percentages,
            'capacity_equipment': capacity_equip,
            'filters': {
                'gender': gender_q,
                'age_min': age_min,
                'age_max': age_max,
                'subcategories': requested_subcats or None,
            }
        }

        # breakdowns (optional) - 현재 분 누적 방식에서 기구 카운트 방식으로 변경되어 breakdown 로직 수정 필요
        # 임시로 비활성화
        if False and 'gender' in breakdown_set:
            by_gender = {}
            for g in ['Male', 'Female']:
                sub_qs = sessions.filter(user__userprofile__gender=g)
                subtotals = [0.0] * 24
                for s in sub_qs.only('start_time', 'end_time'):
                    s_start = s.start_time
                    s_end = s.end_time or tz_now
                    if s_end < day_start_dt or s_start > day_end_dt:
                        continue
                    if s_start < day_start_dt:
                        s_start = day_start_dt
                    if s_end > day_end_dt:
                        s_end = day_end_dt
                    cur = s_start.date()
                    while cur <= s_end.date():
                        slots = slot_map_per_day.get(cur)
                        if not slots:
                            cur += timedelta(days=1)
                            continue
                        for idx, h_start, h_end in slots:
                            minutes = self._overlap_minutes(s_start, s_end, h_start, h_end)
                            if minutes > 0:
                                subtotals[idx] += minutes
                        cur += timedelta(days=1)
                by_gender[g] = [round((m / denom) * 100.0, 1) for m in subtotals]
                if mode == 'single':
                    current_hour = timezone.localtime(tz_now).hour
                    for h in range(current_hour + 1, 24):
                        by_gender[g][h] = None
            result['by_gender'] = by_gender

        if False and 'age' in breakdown_set:
            # 기본 나이 구간
            buckets = [(0,19),(20,29),(30,39),(40,49),(50,59),(60,200)]
            by_age = {}
            for a_min, a_max in buckets:
                label = f"{a_min}-{a_max if a_max<200 else '+'}"
                sub_qs = sessions.filter(user__userprofile__age__gte=a_min, user__userprofile__age__lte=a_max)
                subtotals = [0.0] * 24
                for s in sub_qs.only('start_time', 'end_time'):
                    s_start = s.start_time
                    s_end = s.end_time or tz_now
                    if s_end < day_start_dt or s_start > day_end_dt:
                        continue
                    if s_start < day_start_dt:
                        s_start = day_start_dt
                    if s_end > day_end_dt:
                        s_end = day_end_dt
                    cur = s_start.date()
                    while cur <= s_end.date():
                        slots = slot_map_per_day.get(cur)
                        if not slots:
                            cur += timedelta(days=1)
                            continue
                        for idx, h_start, h_end in slots:
                            minutes = self._overlap_minutes(s_start, s_end, h_start, h_end)
                            if minutes > 0:
                                subtotals[idx] += minutes
                        cur += timedelta(days=1)
                by_age[label] = [round((m / denom) * 100.0, 1) for m in subtotals]
                if mode == 'single':
                    current_hour = timezone.localtime(tz_now).hour
                    for h in range(current_hour + 1, 24):
                        by_age[label][h] = None
            result['by_age'] = by_age

        # subcategory 개별 breakdown
        if False and 'subcategory' in breakdown_set:
            by_subcat = {}
            target_subcats = requested_subcats or list(VALID_SUBCATS)
            for sc in target_subcats:
                sub_qs = sessions.filter(equipment__subcategory=sc)
                subtotals = [0.0]*24
                for s in sub_qs.only('start_time','end_time'):
                    s_start = s.start_time; s_end = s.end_time or tz_now
                    if s_end < day_start_dt or s_start > day_end_dt: continue
                    if s_start < day_start_dt: s_start = day_start_dt
                    if s_end > day_end_dt: s_end = day_end_dt
                    cur = s_start.date()
                    while cur <= s_end.date():
                        slots = slot_map_per_day.get(cur)
                        if not slots: cur += timedelta(days=1); continue
                        for idx,h_start,h_end in slots:
                            minutes = self._overlap_minutes(s_start,s_end,h_start,h_end)
                            if minutes>0: subtotals[idx]+=minutes
                        cur += timedelta(days=1)
                perc = [round((m/denom)*100.0,1) for m in subtotals]
                if mode=='single':
                    current_hour = timezone.localtime(tz_now).hour
                    for h in range(current_hour+1,24): perc[h]=None
                by_subcat[sc]=perc
            result['by_subcategory']=by_subcat

        # muscle_group breakdown
        if False and 'muscle_group' in breakdown_set:
            GROUP_MAP = {
                'CHEST': {'CHEST_PRESS_MAIN','CHEST_PRESS_UPPER','CHEST_FLY'},
                'BACK': {'BACK_PULL_VERTICAL','BACK_ROW_HORIZONTAL'},
                'LEG': {'LEG_PRESS_MAIN','LEG_EXTENSION','LEG_CURL'},
                'SHOULDER': {'SHOULDER_PRESS','SHOULDER_SIDE'},
            }
            # OTHER 그룹: VALID_SUBCATS - union of defined sets
            defined = set().union(*GROUP_MAP.values())
            GROUP_MAP['OTHER'] = VALID_SUBCATS - defined
            by_group = {}
            for gname, members in GROUP_MAP.items():
                sub_qs = sessions.filter(equipment__subcategory__in=members)
                subtotals = [0.0]*24
                for s in sub_qs.only('start_time','end_time'):
                    s_start = s.start_time; s_end = s.end_time or tz_now
                    if s_end < day_start_dt or s_start > day_end_dt: continue
                    if s_start < day_start_dt: s_start = day_start_dt
                    if s_end > day_end_dt: s_end = day_end_dt
                    cur = s_start.date()
                    while cur <= s_end.date():
                        slots = slot_map_per_day.get(cur)
                        if not slots: cur += timedelta(days=1); continue
                        for idx,h_start,h_end in slots:
                            minutes = self._overlap_minutes(s_start,s_end,h_start,h_end)
                            if minutes>0: subtotals[idx]+=minutes
                        cur += timedelta(days=1)
                perc = [round((m/denom)*100.0,1) for m in subtotals]
                if mode=='single':
                    current_hour = timezone.localtime(tz_now).hour
                    for h in range(current_hour+1,24): perc[h]=None
                by_group[gname]=perc
            result['by_muscle_group']=by_group

        return Response(result)


class CurrentUtilizationView(APIView):
        """현재 이용자 수 및 간단 이용률 API.

        이용자 수 = 진행 중 세션(UsageSession.end_time IS NULL) 수
        이용률(%) = 사용중인 기구 수(IN_USE) / (운영 상태 NORMAL 기구 수) * 100
            - 점검(MAINTENANCE), 고장(BROKEN)은 분모에서 제외
        """
        permission_classes = [IsAuthenticated]

        def get(self, request):
            from django.utils import timezone

            include_users = (request.query_params.get('include_users') or '').lower() in ('1','true','yes')

            # 캐시 조회/저장은 네트워크 이슈(예: Redis 다운) 시 예외가 날 수 있으므로 보호합니다.
            cache_key = 'current_utilization_v1'
            cached = None
            try:
                cached = cache.get(cache_key)
            except Exception:
                logger.exception('[reports.current] cache.get 실패 - 캐시 미사용 경로로 진행')

            if not cached:
                # 실데이터 계산 (fallback 포함)
                active_sessions_qs = UsageSession.objects.filter(end_time__isnull=True)
                active_sessions = active_sessions_qs.count()
                capacity_equip = Equipment.objects.filter(operational_state='NORMAL').count() or 1
                active_equip = Equipment.objects.filter(status='IN_USE', operational_state='NORMAL').count()
                utilization = round((active_equip / capacity_equip) * 100.0, 1)
                cached = {
                    'active_sessions': active_sessions,
                    'active_equipments': active_equip,
                    'capacity_equipments': capacity_equip,
                    'utilization_percent': utilization,
                    'generated_at': timezone.now().isoformat(),
                }
                # 5초 TTL 캐시 (best-effort)
                try:
                    cache.set(cache_key, cached, timeout=5)
                except Exception:
                    logger.exception('[reports.current] cache.set 실패 - 계산 결과만 반환')

            resp = dict(cached)
            # true/false로 캐시 사용 여부 표시
            resp['cached'] = bool(cached is not None)
            resp['timestamp'] = timezone.now().isoformat()

            if include_users:
                users_cache_key = 'current_active_users_v1'
                users_cached = None
                try:
                    users_cached = cache.get(users_cache_key)
                except Exception:
                    logger.exception('[reports.current-users] cache.get 실패 - DB 조회로 대체')
                if not users_cached:
                    active_sessions_qs = UsageSession.objects.select_related('user','equipment').filter(end_time__isnull=True)
                    users_cached = [
                        {
                            'session_id': s.id,
                            'user_id': s.user.id,
                            'username': s.user.username,
                            'equipment_id': s.equipment.id if s.equipment else None,
                            'equipment_name': s.equipment.name if s.equipment else None,
                            'subcategory': getattr(s.equipment, 'subcategory', None),
                            'start_time': s.start_time.isoformat(),
                        }
                        for s in active_sessions_qs
                    ]
                    try:
                        cache.set(users_cache_key, users_cached, timeout=5)
                    except Exception:
                        logger.exception('[reports.current-users] cache.set 실패 - 캐시 없이 반환')
                resp['active_users'] = users_cached

            return Response(resp)


class ActiveUtilizationUsersView(APIView):
    """활성 사용자 상세 리스트 전용 API (운영자 클릭 시 사용).

    GET /reports/utilization/active-users/
      - 기초 캐시 TTL 5초 (높은 폴링 대비)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        users_cache_key = 'current_active_users_v1'
        users_cached = None
        try:
            users_cached = cache.get(users_cache_key)
        except Exception:
            logger.exception('[reports.active-users] cache.get 실패 - DB 조회로 대체')
        if not users_cached:
            active_sessions_qs = UsageSession.objects.select_related('user','equipment').filter(end_time__isnull=True)
            users_cached = [
                {
                    'session_id': s.id,
                    'user_id': s.user.id,
                    'username': s.user.username,
                    'equipment_id': s.equipment.id if s.equipment else None,
                    'equipment_name': s.equipment.name if s.equipment else None,
                    'subcategory': getattr(s.equipment, 'subcategory', None),
                    'start_time': s.start_time.isoformat(),
                }
                for s in active_sessions_qs
            ]
            try:
                cache.set(users_cache_key, users_cached, timeout=5)
            except Exception:
                logger.exception('[reports.active-users] cache.set 실패 - 캐시 없이 반환')
        return Response({
            'active_users': users_cached,
            'cached': users_cached is not None,
        })


class EquipmentDailyStatsView(APIView):
    """일일 기구 이용 통계 조회 API (reports 하위).

    GET /reports/daily-stats/?date=YYYY-MM-DD
    GET /reports/daily-stats/?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
      - optional: equipment_id, subcategory, muscle_group
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.utils import timezone
        from datetime import datetime

        # 🔍 [디버깅] 요청 정보 로깅
        logger.info(f"📨 [EquipmentDailyStatsView] GET 요청 받음")
        logger.info(f"   사용자: {request.user}")
        logger.info(f"   쿼리 파라미터: {dict(request.query_params)}")

        def parse_date(val):
            try:
                return datetime.strptime(val, '%Y-%m-%d').date()
            except Exception:
                return None

        date_param = request.query_params.get('date')
        start_param = request.query_params.get('start_date')
        end_param = request.query_params.get('end_date')
        equipment_id = request.query_params.get('equipment_id')
        subcategory = request.query_params.get('subcategory')
        muscle_group = request.query_params.get('muscle_group')

        # 🔍 [디버깅] 파싱된 파라미터
        logger.info(f"   date={date_param}, start={start_param}, end={end_param}")

        today = timezone.localdate()
        if date_param:
            start_date = end_date = parse_date(date_param) or today
        else:
            start_date = parse_date(start_param) or today
            end_date = parse_date(end_param) or start_date

        logger.info(f"   파싱 완료: start_date={start_date}, end_date={end_date}, today={today}")

        if (end_date - start_date).days > 31:
            logger.warning(f"   ❌ 31일 범위 초과: {(end_date - start_date).days}일")
            return Response({'detail': '최대 31일 범위를 초과했습니다.'}, status=400)

        qs = EquipmentDailyStats.objects.select_related('equipment').filter(date__gte=start_date, date__lte=end_date)
        logger.info(f"   📊 초기 쿼리셋 개수: {qs.count()}")
        if equipment_id:
            qs = qs.filter(equipment_id=equipment_id)
        if subcategory:
            qs = qs.filter(equipment__subcategory=subcategory)
        if muscle_group:
            GROUP_MAP = {
                'CHEST': {'CHEST_PRESS_MAIN','CHEST_PRESS_UPPER','CHEST_FLY'},
                'BACK': {'BACK_PULL_VERTICAL','BACK_ROW_HORIZONTAL'},
                'LEG': {'LEG_PRESS_MAIN','LEG_EXTENSION','LEG_CURL'},
                'SHOULDER': {'SHOULDER_PRESS','SHOULDER_SIDE'},
            }
            defined = set().union(*GROUP_MAP.values())
            GROUP_MAP['OTHER'] = defined  # placeholder (OTHER 분류는 별도 확장 필요)
            members = GROUP_MAP.get(muscle_group.upper())
            if members:
                qs = qs.filter(equipment__subcategory__in=members)

        records = []
        for stat in qs.order_by('date'):
            records.append({
                'equipment_id': stat.equipment_id,
                'equipment_name': stat.equipment.name,
                'date': stat.date.isoformat(),
                'usage_count': stat.usage_count,
                'total_usage_minutes': stat.total_usage_minutes,
                'average_time_minutes': round(stat.average_time_minutes,1),
            })

        logger.info(f"   ✅ 기구별 레코드 개수: {len(records)}")
        for i, r in enumerate(records[:3]):  # 처음 3개만 로깅
            logger.info(f"      [{i}] {r['equipment_name']}: {r['usage_count']}회, 평균 {r['average_time_minutes']}분")

        # 집계 요약
        agg = None
        if start_date != end_date:
            total_count = sum(r['usage_count'] for r in records)
            total_minutes = sum(r['total_usage_minutes'] for r in records)
            avg_minutes = round(total_minutes / total_count, 1) if total_count else 0.0
            agg = {
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat(),
                'total_usage_count': total_count,
                'total_usage_minutes': total_minutes,
                'overall_average_time_minutes': avg_minutes,
            }

        logger.info(f"📤 [EquipmentDailyStatsView] 응답 전송: {len(records)}개 레코드")
        return Response({
            'range': {'start': start_date.isoformat(), 'end': end_date.isoformat()},
            'records': records,
            'aggregate': agg,
        })


class BodyPartDailyStatsView(APIView):
    """부위별 일일 이용 통계 조회 API.

    GET /reports/daily-stats/by-body-part/?date=YYYY-MM-DD
    GET /reports/daily-stats/by-body-part/?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
    
    8개 AI 루틴 카테고리로 집계: 등, 가슴, 복근, 힙, 허벅지, 종아리, 유산소, 어깨
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.utils import timezone
        from datetime import datetime
        from django.db.models import Sum

        # 🔍 [디버깅] 요청 정보 로깅
        logger.info(f"📨 [BodyPartDailyStatsView] GET 요청 받음")
        logger.info(f"   사용자: {request.user}")
        logger.info(f"   쿼리 파라미터: {dict(request.query_params)}")

        def parse_date(val):
            try:
                return datetime.strptime(val, '%Y-%m-%d').date()
            except Exception:
                return None

        date_param = request.query_params.get('date')
        start_param = request.query_params.get('start_date')
        end_param = request.query_params.get('end_date')

        today = timezone.localdate()
        if date_param:
            start_date = end_date = parse_date(date_param) or today
        else:
            start_date = parse_date(start_param) or today
            end_date = parse_date(end_param) or start_date

        logger.info(f"   파싱 완료: start_date={start_date}, end_date={end_date}")

        if (end_date - start_date).days > 31:
            logger.warning(f"   ❌ 31일 범위 초과: {(end_date - start_date).days}일")
            return Response({'detail': '최대 31일 범위를 초과했습니다.'}, status=400)

        # 기구별 통계 가져오기
        stats = EquipmentDailyStats.objects.select_related('equipment').filter(
            date__gte=start_date,
            date__lte=end_date
        )
        logger.info(f"   📊 조회된 EquipmentDailyStats: {stats.count()}개")

        # 8개 부위별로 집계
        body_part_map = {
            '등': {'usage_count': 0, 'total_minutes': 0},
            '가슴': {'usage_count': 0, 'total_minutes': 0},
            '복근': {'usage_count': 0, 'total_minutes': 0},
            '힙': {'usage_count': 0, 'total_minutes': 0},
            '허벅지': {'usage_count': 0, 'total_minutes': 0},
            '종아리': {'usage_count': 0, 'total_minutes': 0},
            '유산소': {'usage_count': 0, 'total_minutes': 0},
            '어깨': {'usage_count': 0, 'total_minutes': 0},
            '기타': {'usage_count': 0, 'total_minutes': 0},
        }

        mapped_count = 0
        for stat in stats:
            equip = stat.equipment
            category = '기타'

            if equip.subcategory:
                sub = equip.subcategory
                if 'CHEST' in sub:
                    category = '가슴'
                elif 'BACK' in sub:
                    category = '등'
                elif 'SHOULDER' in sub:
                    category = '어깨'
                elif sub == 'LEG_PRESS_MAIN' or sub == 'LEG_EXTENSION':
                    category = '허벅지'
                elif sub == 'LEG_CURL':
                    category = '종아리'
            elif equip.body_part:
                bp = equip.body_part
                if bp == 'UPPER':
                    category = '가슴'
                elif bp == 'LOWER':
                    category = '허벅지'
                elif bp == 'CORE':
                    category = '복근'
                elif bp == 'CARDIO':
                    category = '유산소'

            body_part_map[category]['usage_count'] += stat.usage_count
            body_part_map[category]['total_minutes'] += stat.total_usage_minutes
            mapped_count += 1

        logger.info(f"   🔄 매핑 완료: {mapped_count}개 레코드를 부위별로 집계")

        # 결과 배열 생성 (기타 제외, 사용량 있는 것만)
        records = []
        for part, data in body_part_map.items():
            if part == '기타' and data['usage_count'] == 0:
                continue
            avg_time = round(data['total_minutes'] / data['usage_count'], 1) if data['usage_count'] > 0 else 0.0
            records.append({
                'body_part': part,
                'usage_count': data['usage_count'],
                'total_usage_minutes': data['total_minutes'],
                'average_time_minutes': avg_time,
            })

        # 가나다순 정렬
        records.sort(key=lambda x: x['body_part'])

        logger.info(f"   ✅ 부위별 레코드 개수: {len(records)}")
        for i, r in enumerate(records):
            logger.info(f"      [{i}] {r['body_part']}: {r['usage_count']}회, 평균 {r['average_time_minutes']}분")

        logger.info(f"📤 [BodyPartDailyStatsView] 응답 전송: {len(records)}개 부위별 통계")
        return Response({
            'range': {'start': start_date.isoformat(), 'end': end_date.isoformat()},
            'records': records,
        })
