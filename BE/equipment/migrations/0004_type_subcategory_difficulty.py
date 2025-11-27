from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [
        ('equipment', '0003_add_broken_state'),
    ]

    operations = [
        migrations.AlterField(
            model_name='equipment',
            name='type',
            field=models.CharField(
                max_length=20,
                choices=[
                    ('FREE_WEIGHT', '프리웨이트'),
                    ('MACHINE', '머신'),
                    ('PLATE_LOADED', '플레이트로디드'),
                    ('CABLE', '케이블'),
                    ('SMITH_MACHINE', '스미스머신'),
                    ('CARDIO', '유산소'),
                ],
            ),
        ),
        migrations.AlterField(
            model_name='equipment',
            name='subcategory',
            field=models.CharField(
                max_length=30,
                choices=[
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
                ],
                blank=True,
                null=True,
                help_text='상세 운동 부위 (AI 추천/대체 그룹)'
            ),
        ),
        migrations.AddField(
            model_name='equipment',
            name='difficulty',
            field=models.CharField(
                max_length=10,
                choices=[('HIGH', '상'), ('MID', '중'), ('LOW', '하')],
                default='MID',
                help_text='운동 난이도 (상/중/하)'
            ),
        ),
    ]
