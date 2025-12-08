from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import datetime, timedelta
from collections import defaultdict
import logging

from workouts.models import UsageSession
from reports.models import EquipmentDailyStats

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = '과거 UsageSession 데이터를 EquipmentDailyStats로 역으로 집계'

    def add_arguments(self, parser):
        parser.add_argument(
            '--start-date',
            type=str,
            default='2025-11-01',
            help='시작 날짜 (YYYY-MM-DD, 기본값: 2025-11-01)'
        )
        parser.add_argument(
            '--end-date',
            type=str,
            help='종료 날짜 (YYYY-MM-DD, 기본값: 어제)'
        )

    def handle(self, *args, **options):
        try:
            start_date = datetime.strptime(options['start_date'], '%Y-%m-%d').date()
            
            if options['end_date']:
                end_date = datetime.strptime(options['end_date'], '%Y-%m-%d').date()
            else:
                end_date = timezone.now().date() - timedelta(days=1)

            self.stdout.write(
                self.style.SUCCESS(f"⏳ 시작: {start_date} ~ {end_date}")
            )

            # 종료된 세션만 조회 (end_time이 NULL이 아님)
            sessions = UsageSession.objects.filter(
                start_time__date__gte=start_date,
                start_time__date__lte=end_date,
                end_time__isnull=False  # ⭐ 완료된 세션만
            ).select_related('equipment').order_by('start_time')

            total_sessions = sessions.count()
            self.stdout.write(f"📊 집계할 세션: {total_sessions}개\n")

            if total_sessions == 0:
                self.stdout.write(
                    self.style.WARNING("⚠️  해당 기간에 완료된 세션이 없습니다.")
                )
                return

            # 날짜별로 그룹화하여 집계
            stats_by_date_equip = defaultdict(lambda: {
                'usage_count': 0,
                'total_minutes': 0.0,
            })

            processed_count = 0
            for session in sessions:
                try:
                    session_date = session.start_time.date()
                    equip_id = session.equipment_id

                    # 사용 시간 계산 (분 단위)
                    duration = (session.end_time - session.start_time).total_seconds() / 60
                    
                    stats_by_date_equip[(equip_id, session_date)]['usage_count'] += 1
                    stats_by_date_equip[(equip_id, session_date)]['total_minutes'] += duration
                    
                    processed_count += 1
                except Exception as e:
                    self.stdout.write(
                        self.style.ERROR(f"❌ 세션 {session.id} 처리 중 오류: {e}")
                    )
                    continue

            self.stdout.write(f"✅ 수집 완료: {processed_count}개 세션 처리\n")

            # EquipmentDailyStats 저장
            self.stdout.write("💾 데이터베이스에 저장 중...\n")
            
            created_count = 0
            updated_count = 0

            for (equip_id, stat_date), stats in stats_by_date_equip.items():
                try:
                    avg_time = (stats['total_minutes'] / stats['usage_count']
                               if stats['usage_count'] > 0 else 0)
                    
                    daily_stat, created = EquipmentDailyStats.objects.update_or_create(
                        equipment_id=equip_id,
                        date=stat_date,
                        defaults={
                            'usage_count': stats['usage_count'],
                            'total_usage_minutes': int(stats['total_minutes']),
                            'average_time_minutes': round(avg_time, 1)
                        }
                    )
                    
                    if created:
                        created_count += 1
                        status = "🆕 생성"
                    else:
                        updated_count += 1
                        status = "🔄 업데이트"
                    
                    # 매 50개마다 진행 상황 출력
                    if (created_count + updated_count) % 50 == 0:
                        self.stdout.write(
                            f"진행: {created_count + updated_count}개 처리됨..."
                        )
                    
                    logger.info(
                        f"{status}: 기구 {equip_id}, {stat_date}, "
                        f"{stats['usage_count']}회, {int(stats['total_minutes'])}분"
                    )
                except Exception as e:
                    self.stdout.write(
                        self.style.ERROR(f"❌ 기구 {equip_id}, {stat_date} 저장 실패: {e}")
                    )
                    continue

            total_records = created_count + updated_count
            self.stdout.write(
                self.style.SUCCESS(
                    f"\n✅ 역 집계 완료!\n"
                    f"   - 생성: {created_count}개\n"
                    f"   - 업데이트: {updated_count}개\n"
                    f"   - 합계: {total_records}개"
                )
            )

        except ValueError as e:
            self.stdout.write(
                self.style.ERROR(f"❌ 날짜 형식 오류: {e} (형식: YYYY-MM-DD)")
            )
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f"❌ 예상치 못한 오류: {e}")
            )
            logger.exception("Backfill 명령 실행 중 오류")
