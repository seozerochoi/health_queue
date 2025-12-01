from django.db import migrations, models
import django.db.models.deletion
from django.conf import settings


class Migration(migrations.Migration):

    dependencies = [
        ('reports', '0002_adopt_equipmentdailystats'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # Report.report_type 추가
        migrations.AddField(
            model_name='report',
            name='report_type',
            field=models.CharField(
                max_length=20,
                choices=[('malfunction', 'Malfunction'), ('violation', 'User Violation'), ('other', 'Other')],
                default='other',
            ),
        ),
        # Report.reported_user 를 null/blank 허용으로 변경
        migrations.AlterField(
            model_name='report',
            name='reported_user',
            field=models.ForeignKey(
                related_name='received_reports',
                on_delete=django.db.models.deletion.CASCADE,
                to=settings.AUTH_USER_MODEL,
                null=True,
                blank=True,
            ),
        ),
    ]
