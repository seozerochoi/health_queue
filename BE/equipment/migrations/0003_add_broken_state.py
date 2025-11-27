# Generated migration for adding BROKEN state to operational_state

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('equipment', '0002_add_operational_state'),
    ]

    operations = [
        migrations.AlterField(
            model_name='equipment',
            name='operational_state',
            field=models.CharField(
                choices=[('NORMAL', '정상'), ('MAINTENANCE', '점검중'), ('BROKEN', '고장')],
                default='NORMAL',
                help_text='운영자가 설정하는 기구의 운영 상태 (정상 / 점검중 / 고장)',
                max_length=20
            ),
        ),
    ]
