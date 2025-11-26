"""
Management command to add all users to SmartGym (헬스장 ID 1)
Usage: python manage.py add_all_users_to_smartgym
"""

from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from gyms.models import Gym, GymMembership


class Command(BaseCommand):
    help = '모든 사용자를 스마트짐(ID 1)에 APPROVED 상태로 추가합니다.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--gym-id',
            type=int,
            default=1,
            help='헬스장 ID (기본값: 1 - 스마트짐)',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='실제 변경 없이 미리보기만 실행',
        )

    def handle(self, *args, **options):
        gym_id = options['gym_id']
        dry_run = options['dry_run']

        try:
            gym = Gym.objects.get(pk=gym_id)
        except Gym.DoesNotExist:
            self.stdout.write(
                self.style.ERROR(f'❌ 헬스장 ID {gym_id}를 찾을 수 없습니다.')
            )
            return

        self.stdout.write(
            self.style.WARNING(f'🏋️ 대상 헬스장: {gym.name} (ID: {gym.id})')
        )

        all_users = User.objects.all()
        total_users = all_users.count()

        self.stdout.write(f'📊 전체 사용자 수: {total_users}명')

        if dry_run:
            self.stdout.write(
                self.style.WARNING('⚠️ DRY RUN 모드 - 실제 변경 없음')
            )

        created_count = 0
        already_exists_count = 0
        updated_count = 0

        for user in all_users:
            membership, created = GymMembership.objects.get_or_create(
                user=user,
                gym=gym,
                defaults={'status': 'APPROVED'}
            )

            if not dry_run:
                if created:
                    created_count += 1
                    self.stdout.write(
                        self.style.SUCCESS(
                            f'✅ {user.username} - 새로 추가 (APPROVED)'
                        )
                    )
                else:
                    if membership.status != 'APPROVED':
                        membership.status = 'APPROVED'
                        membership.save()
                        updated_count += 1
                        self.stdout.write(
                            self.style.SUCCESS(
                                f'🔄 {user.username} - APPROVED로 업데이트'
                            )
                        )
                    else:
                        already_exists_count += 1
                        self.stdout.write(
                            f'ℹ️  {user.username} - 이미 APPROVED 상태'
                        )
            else:
                if created:
                    # Rollback for dry run
                    membership.delete()
                    self.stdout.write(
                        self.style.WARNING(
                            f'🔍 {user.username} - 추가 예정 (DRY RUN)'
                        )
                    )
                else:
                    self.stdout.write(
                        f'🔍 {user.username} - 이미 존재 (status: {membership.status})'
                    )

        self.stdout.write('\n' + '='*60)
        self.stdout.write(self.style.SUCCESS('📊 실행 결과:'))
        if not dry_run:
            self.stdout.write(f'  ✅ 새로 추가: {created_count}명')
            self.stdout.write(f'  🔄 업데이트: {updated_count}명')
            self.stdout.write(f'  ℹ️  이미 존재: {already_exists_count}명')
            self.stdout.write(
                self.style.SUCCESS(
                    f'\n🎉 총 {created_count + updated_count}명의 사용자가 {gym.name}에 추가/업데이트되었습니다!'
                )
            )
        else:
            self.stdout.write(
                self.style.WARNING(
                    '\n⚠️ DRY RUN 완료 - 실제 변경을 원하면 --dry-run 없이 실행하세요.'
                )
            )
