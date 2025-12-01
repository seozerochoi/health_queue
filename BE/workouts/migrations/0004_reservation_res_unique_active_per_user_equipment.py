from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('workouts', '0003_add_last_heartbeat'),
    ]

    operations = [
        migrations.AddConstraint(
            model_name='reservation',
            constraint=models.UniqueConstraint(
                fields=['user', 'equipment'],
                condition=models.Q(status__in=['WAITING', 'NOTIFIED']),
                name='res_unique_active_per_user_equipment',
            ),
        ),
    ]
