# Generated migration for EquipmentDailyStats model

from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('equipment', '0004_type_subcategory_difficulty'),  # 최신 마이그레이션에 맞게 조정
    ]

    operations = [
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
                'ordering': ['-date'],
            },
        ),
        migrations.AddIndex(
            model_name='equipmentdailystats',
            index=models.Index(fields=['equipment', 'date'], name='equipment_d_equipme_idx'),
        ),
        migrations.AddIndex(
            model_name='equipmentdailystats',
            index=models.Index(fields=['date'], name='equipment_d_date_idx'),
        ),
        migrations.AlterUniqueTogether(
            name='equipmentdailystats',
            unique_together={('equipment', 'date')},
        ),
    ]
