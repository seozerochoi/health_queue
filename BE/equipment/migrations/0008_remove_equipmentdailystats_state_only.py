from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('equipment', '0007_equipment_ai_model_body_part_image_url'),
    ]

    # 이 마이그레이션은 EquipmentDailyStats 모델을 equipment 앱 상태에서 제거하되
    # 실제 데이터베이스 테이블은 삭제하지 않기 위해 상태 전용(state-only)으로 처리합니다.

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.DeleteModel('EquipmentDailyStats'),
            ],
        ),
    ]
