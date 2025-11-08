# Generated migration for adding operational_state field
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('equipment', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='equipment',
            name='operational_state',
            field=models.CharField(choices=[('NORMAL', '정상'), ('MAINTENANCE', '점검중')], default='NORMAL', max_length=20, help_text='운영자가 설정하는 기구의 운영 상태 (정상 / 점검중)'),
        ),
    ]
