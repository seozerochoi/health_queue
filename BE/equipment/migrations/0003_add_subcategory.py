# Generated migration for adding subcategory (detailed body part) field
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('equipment', '0002_add_operational_state'),
    ]

    operations = [
        migrations.AddField(
            model_name='equipment',
            name='subcategory',
            field=models.CharField(
                max_length=20,
                choices=[
                    ('UPPER_BICEPS', '이두'),
                    ('UPPER_TRICEPS', '삼두'),
                    ('UPPER_CHEST', '가슴'),
                    ('UPPER_SHOULDER', '어깨'),
                    ('UPPER_BACK', '등'),
                    ('LOWER_THIGH', '허벅지'),
                    ('LOWER_CALF', '종아리'),
                ],
                null=True,
                blank=True,
                help_text='상세 운동 부위 (예: 상체-이두, 하체-허벅지). 상체/하체에서만 선택 필요',
            ),
        ),
    ]
