from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('reports', '0001_initial'),
        ('equipment', '0005_equipment_daily_stats'),
    ]

    # 이 마이그레이션은 기존 equipment_equipmentdailystats 테이블을
    # reports 앱의 모델로 "채택"(adopt)하기 위한 상태 전용(state-only) 변경입니다.
    # 데이터베이스에는 어떤 변동도 하지 않습니다.

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.CreateModel(
                    name='EquipmentDailyStats',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('date', models.DateField(default=django.utils.timezone.now)),
                        ('usage_count', models.IntegerField(default=0, help_text='오늘 이용 횟수')),
                        ('total_usage_minutes', models.IntegerField(default=0, help_text='총 사용 시간(분)')),
                        ('average_time_minutes', models.FloatField(default=0.0, help_text='평균 시간(분)')),
                        ('created_at', models.DateTimeField(auto_now_add=True)),
                        ('updated_at', models.DateTimeField(auto_now=True)),
                        ('equipment', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='daily_stats', to='equipment.equipment')),
                    ],
                    options={
                        'db_table': 'equipment_equipmentdailystats',
                        'ordering': ['-date'],
                        'unique_together': {('equipment', 'date')},
                        'indexes': [
                            models.Index(fields=['equipment', 'date']),
                            models.Index(fields=['date']),
                        ],
                    },
                ),
            ],
        )
    ]
