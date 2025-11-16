from django.core.management.base import BaseCommand
from django.utils import timezone
from workouts.models import Reservation
from django.db import transaction
import datetime


class Command(BaseCommand):
    help = 'Expire NOTIFIED reservations older than the configured timeout and notify next waiting user.'

    # 기본 만료 시간(분) - 데모를 위해 기본을 0.25분(15초)로 설정
    DEFAULT_TIMEOUT_MINUTES = 0.25

    def add_arguments(self, parser):
        parser.add_argument(
            '--minutes',
            type=float,
            help='만료 타임아웃(분). 소수값 허용 (예: 0.25 = 15초). 기본값은 0.25분입니다.',
            default=self.DEFAULT_TIMEOUT_MINUTES,
        )

    def handle(self, *args, **options):
        timeout_minutes = options.get('minutes', self.DEFAULT_TIMEOUT_MINUTES)
        cutoff = timezone.now() - datetime.timedelta(minutes=timeout_minutes)

        self.stdout.write(f'Expire reservations NOTIFIED before {cutoff.isoformat()}')

        # 트랜잭션 내부에서 처리: 만료시키고 다음 대기자 알림
        expired_count = 0
        notified_count = 0

        with transaction.atomic():
            expired_reservations = Reservation.objects.select_for_update().filter(status='NOTIFIED', notified_at__lt=cutoff)

            for r in expired_reservations:
                self.stdout.write(f'Expiring reservation id={r.id} user={r.user.username} equipment={r.equipment.name}')
                r.status = 'EXPIRED'
                r.save()
                expired_count += 1

                # 다음 대기자에게 알림 상태로 변경
                next_r = Reservation.objects.filter(equipment=r.equipment, status='WAITING').order_by('created_at').first()
                if next_r:
                    next_r.status = 'NOTIFIED'
                    next_r.notified_at = timezone.now()
                    next_r.save()
                    notified_count += 1
                    self.stdout.write(f'Notified next reservation id={next_r.id} user={next_r.user.username}')
                    # TODO: 실제 푸시 전송 로직을 여기에 추가

        self.stdout.write(self.style.SUCCESS(f'Expired: {expired_count}, Notified: {notified_count}'))
