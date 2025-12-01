from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('equipment', '0006_remove_equipmentdailystats_state_only'),
    ]

    operations = [
        # image_url 추가
        migrations.AddField(
            model_name='equipment',
            name='image_url',
            field=models.URLField(max_length=500, blank=True, null=True, help_text='운동기구 이미지 URL'),
        ),
        # body_part 추가
        migrations.AddField(
            model_name='equipment',
            name='body_part',
            field=models.CharField(
                max_length=10,
                choices=[
                    ('UPPER', '상체'),
                    ('LOWER', '하체'),
                    ('CORE', '코어'),
                    ('CARDIO', '유산소'),
                    ('ETC', '기타'),
                ],
                default='ETC',
                help_text='이 기구의 주요 운동 부위 (AI 비율 계산에 사용)'
            ),
        ),
        # ai_model_id 추가
        migrations.AddField(
            model_name='equipment',
            name='ai_model_id',
            field=models.IntegerField(default=0, help_text='AI 모델이 인식하는 기구 ID (training_script.py와 일치해야 함, 예: 0=벤치)'),
        ),
        # status 필드 옵션 업데이트(choices/help_text 등 변경이 감지된 경우용)
        migrations.AlterField(
            model_name='equipment',
            name='status',
            field=models.CharField(
                max_length=20,
                choices=[
                    ('AVAILABLE', 'Available'),
                    ('IN_USE', 'In Use'),
                    ('WAITING', 'Waiting'),
                    ('OUT_OF_ORDER', 'Out of Order'),
                ],
                default='AVAILABLE',
            ),
        ),
    ]
