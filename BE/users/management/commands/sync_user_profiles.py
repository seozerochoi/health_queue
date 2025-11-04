"""
Django management command to sync UserProfiles with User.is_staff values.
Usage: python manage.py sync_user_profiles
"""
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from users.models import UserProfile


class Command(BaseCommand):
    help = 'Creates or updates UserProfiles for all users based on their is_staff status'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Starting UserProfile sync...'))
        
        created_count = 0
        updated_count = 0
        unchanged_count = 0
        
        for user in User.objects.all():
            expected_role = 'OPERATOR' if user.is_staff else 'MEMBER'
            
            try:
                profile = user.userprofile
                if profile.role != expected_role:
                    profile.role = expected_role
                    profile.save()
                    updated_count += 1
                    self.stdout.write(
                        self.style.WARNING(
                            f'Updated: {user.username} (is_staff={user.is_staff}) -> role={expected_role}'
                        )
                    )
                else:
                    unchanged_count += 1
                    self.stdout.write(
                        f'OK: {user.username} (role={profile.role} matches is_staff={user.is_staff})'
                    )
            except UserProfile.DoesNotExist:
                profile = UserProfile.objects.create(user=user, role=expected_role)
                created_count += 1
                self.stdout.write(
                    self.style.SUCCESS(
                        f'Created: {user.username} (is_staff={user.is_staff}) -> role={expected_role}'
                    )
                )
        
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('=' * 60))
        self.stdout.write(self.style.SUCCESS(f'Summary:'))
        self.stdout.write(self.style.SUCCESS(f'  Created:   {created_count}'))
        self.stdout.write(self.style.WARNING(f'  Updated:   {updated_count}'))
        self.stdout.write(f'  Unchanged: {unchanged_count}')
        self.stdout.write(f'  Total:     {created_count + updated_count + unchanged_count}')
        self.stdout.write(self.style.SUCCESS('=' * 60))
