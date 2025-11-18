from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('workouts', '0002_add_reservation_indexes'),
    ]

    operations = [
        migrations.AddField(
            model_name='usagesession',
            name='last_heartbeat',
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
    ]
