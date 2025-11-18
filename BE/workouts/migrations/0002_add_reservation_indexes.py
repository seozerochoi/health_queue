# Generated manually for performance optimization

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('workouts', '0001_initial'),
    ]

    operations = [
        # Add db_index to status field
        migrations.AlterField(
            model_name='reservation',
            name='status',
            field=models.CharField(
                choices=[('WAITING', 'Waiting'), ('NOTIFIED', 'Notified'), ('EXPIRED', 'Expired'), ('COMPLETED', 'Completed')],
                db_index=True,
                default='WAITING',
                max_length=20
            ),
        ),
        # Add composite indexes for fast queries
        migrations.AddIndex(
            model_name='reservation',
            index=models.Index(fields=['equipment', 'status'], name='res_equip_status_idx'),
        ),
        migrations.AddIndex(
            model_name='reservation',
            index=models.Index(fields=['status', 'notified_at'], name='res_status_notified_idx'),
        ),
    ]
