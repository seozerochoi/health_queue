# equipment/models.py

from django.db import models, transaction
from django.core.exceptions import ValidationError
from django.db.models.signals import post_save
from django.dispatch import receiver
from gyms.models import Gym

class Equipment(models.Model):
    gym = models.ForeignKey(Gym, on_delete=models.CASCADE)
    name = models.CharField(max_length=100)
    
    TYPE_CHOICES = [
        ('FREE_WEIGHT', '프리웨이트'),
        ('MACHINE', '머신'),
        ('PLATE_LOADED', '플레이트로디드'),
        ('CABLE', '케이블'),
        ('SMITH_MACHINE', '스미스머신'),
        ('CARDIO', '유산소'),
    ]
    type = models.CharField(max_length=20, choices=TYPE_CHOICES)

    nfc_tag_id = models.CharField(max_length=100, unique=True)
    arduino_id = models.CharField(max_length=100, unique=True)

    STATUS_CHOICES = [
        ('AVAILABLE', 'Available'),
        ('IN_USE', 'In Use'),
        ('WAITING', 'Waiting'),
        ('OUT_OF_ORDER', 'Out of Order'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='AVAILABLE')
    OPERATIONAL_STATE_CHOICES = [
        ('NORMAL', '정상'),
        ('MAINTENANCE', '점검중'),
        ('BROKEN', '고장'),
    ]
    operational_state = models.CharField(
        max_length=20,
        choices=OPERATIONAL_STATE_CHOICES,
        default='NORMAL',
        help_text='운영자가 설정하는 기구의 운영 상태 (정상 / 점검중 / 고장)'
    )
    base_session_time_minutes = models.IntegerField(default=15)
    image_url = models.URLField(max_length=500, blank=True, null=True, help_text="운동기구 이미지 URL")

    BODY_PART_CHOICES = [
        ('UPPER', '상체'),
        ('LOWER', '하체'),
        ('CORE', '코어'),
        ('CARDIO', '유산소'),
        ('ETC', '기타'),
    ]
    body_part = models.CharField(
        max_length=10, 
        choices=BODY_PART_CHOICES, 
        default='ETC',
        help_text="이 기구의 주요 운동 부위 (AI 비율 계산에 사용)"
    )
    # 세부 부위(하부 카테고리)
    SUBCATEGORY_CHOICES = [
        ('CHEST_PRESS_MAIN', '가슴 프레스 메인'),
        ('CHEST_PRESS_UPPER', '가슴 프레스 상부'),
        ('CHEST_FLY', '가슴 플라이'),
        ('BACK_PULL_VERTICAL', '등 풀다운/풀업'),
        ('BACK_ROW_HORIZONTAL', '등 로우'),
        ('LEG_PRESS_MAIN', '하체 프레스/스쿼트'),
        ('LEG_EXTENSION', '다리 익스텐션'),
        ('LEG_CURL', '다리 컬'),
        ('SHOULDER_PRESS', '어깨 프레스'),
        ('SHOULDER_SIDE', '어깨 사이드'),
    ]
    subcategory = models.CharField(
        max_length=30,
        choices=SUBCATEGORY_CHOICES,
        blank=True,
        null=True,
        help_text="상세 운동 부위 (AI 추천/대체 그룹)"
    )

    DIFFICULTY_CHOICES = [
        ('HIGH', '상'),
        ('MID', '중'),
        ('LOW', '하'),
    ]
    difficulty = models.CharField(
        max_length=10,
        choices=DIFFICULTY_CHOICES,
        default='MID',
        help_text="운동 난이도 (상/중/하)"
    )
    # 유효 조합 맵
    SUBCATEGORY_BY_BODY_PART = {
        'UPPER': {c for c, _ in SUBCATEGORY_CHOICES if c.startswith('UPPER_')},
        'LOWER': {c for c, _ in SUBCATEGORY_CHOICES if c.startswith('LOWER_')},
        'CORE': set(),
        'CARDIO': set(),
        'ETC': set(),
    }
    ai_model_id = models.IntegerField(
        default=0, 
        help_text="AI 모델이 인식하는 기구 ID (training_script.py와 일치해야 함, 예: 0=벤치)"
    )

    def __str__(self):
        return f'{self.gym.name} - {self.name}'

    def clean(self):
        """body_part와 subcategory의 유효 조합을 검증합니다."""
        allowed = self.SUBCATEGORY_BY_BODY_PART.get(self.body_part, set())
        # 상체/하체: 하위 카테고리 필수 및 허용된 값만 가능
        if self.body_part in ('UPPER', 'LOWER'):
            if not self.subcategory:
                raise ValidationError({'subcategory': '상체/하체 선택 시 세부 부위를 반드시 지정해야 합니다.'})
            if self.subcategory not in allowed:
                raise ValidationError({'subcategory': '선택한 상/하체와 세부 부위 조합이 올바르지 않습니다.'})
        else:
            # 코어/유산소/기타: 세부 부위는 비워두어야 함
            if self.subcategory:
                raise ValidationError({'subcategory': '코어/유산소/기타 카테고리에서는 세부 부위를 비워두세요.'})


# Signal to automatically publish SSE events when Equipment status changes
@receiver(post_save, sender=Equipment)
def equipment_post_save(sender, instance, created, **kwargs):
    """Equipment 객체 저장 후 상태/운영 상태 변경 혹은 생성 시 SSE 업데이트 발행.

    중복 발행 방지:
    - created: 항상 발행
    - update_fields 지정된 경우: status / operational_state 변경 시만 발행
    - update_fields 미지정인 경우(일반 save): status 또는 operational_state가 실제로 변경되었는지 확인하려면
      향후 dirty-field 추적 라이브러리 도입 고려. 현재는 보수적으로 전체 저장은 발행하지 않고 세션 관리 코드가
      명시적으로 publish 하는 경우를 우선.
    """
    import logging
    logger = logging.getLogger(__name__)

    update_fields = kwargs.get('update_fields')
    should_notify = False

    if created:
        should_notify = True
        logger.info(f"📝 [Equipment] 생성: id={instance.id} name={instance.name}")
    elif update_fields:
        fields_lower = {f.lower() for f in update_fields}
        if 'status' in fields_lower or 'operational_state' in fields_lower:
            should_notify = True
            logger.info(f"📝 [Equipment] 상태변경: id={instance.id} status={instance.status} operational={instance.operational_state}")
    else:
        # update_fields 미지정: 다른 코드에서 이미 publish 했을 가능성 높음 -> 중복 방지 위해 무시
        logger.debug(f"ℹ️ [Equipment] post_save (update_fields 없음) - 중복 방지로 SSE 미발행 id={instance.id}")

    if should_notify:
        import time
        signal_start = time.time()
        
        from equipment.event_bus import publish_equipment_update
        from workouts.models import Reservation
        
        # ⚡ Pre-calculate waiting_count to avoid DB query in publish function
        query_start = time.time()
        waiting_count = Reservation.objects.filter(
            equipment=instance,
            status__in=["WAITING", "NOTIFIED"],
        ).count()
        query_time = time.time() - query_start
        
        try:
            # ⚡ IMMEDIATE publish - no transaction.on_commit() delay
            publish_start = time.time()
            publish_equipment_update(instance, waiting_count=waiting_count)
            publish_time = time.time() - publish_start
            total_time = time.time() - signal_start
            
            logger.info(
                f"⏱️ [Equipment Signal] Timing - "
                f"query: {query_time*1000:.1f}ms, "
                f"publish: {publish_time*1000:.1f}ms, "
                f"total: {total_time*1000:.1f}ms | "
                f"id={instance.id} waiting={waiting_count}"
            )
        except Exception:
            logger.exception(f"❌ [Equipment Signal] 발행 실패: id={instance.id}")