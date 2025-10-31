from celery import shared_task
from .models import UsageLog, WaitlistEntry
from gyms.models import Equipment
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from notifications.services import send_push_notification
import json

@shared_task
def auto_end_usage(usage_log_id):
    """
    사용 시간이 만료되었을 때 호출되는 백그라운드 작업입니다.
    대기자 유무에 따라 다른 동작을 수행합니다.
    """
    try:
        usage_log = UsageLog.objects.get(id=usage_log_id)
        equipment = usage_log.equipment
        user = usage_log.user

        # --- 핵심 로직: 대기자가 있는지 먼저 확인 ---
        if WaitlistEntry.objects.filter(equipment=equipment).exists():
            # [cite_start]1. 대기자가 있는 경우 (공정성 우선) [cite: 91]
            print(f"대기자 있음: {equipment.name} 사용을 자동으로 종료합니다.")
            
            # 기존 로직과 동일하게 사용을 종료하고 기구를 잠급니다.
            usage_log.delete()
            equipment.status = Equipment.Status.LOCKED
            equipment.save()
            
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                f'equipment_{equipment.id}',
                {'type': 'send.command', 'command': 'lock'}
            )
            # TODO: 다음 대기자에게 사용 시작 알림 보내기
            
        else:
            # [cite_start]2. 대기자가 없는 경우 (유연성) [cite: 97]
            print(f"대기자 없음: {user.email}에게 연장 여부 알림을 보냅니다.")
            
            # 기구를 잠그거나 사용 기록을 삭제하지 않고,
            # [cite_start]대신 사용자에게 연장할지 물어보는 푸시 알림을 보냅니다. [cite: 98]
            send_push_notification(
                user_fcm_token=user.fcm_token,
                title="대기자가 없습니다",
                body=f"{equipment.name} 이용 시간을 연장하시겠습니까?"
            )
            # 여기에 1분 뒤 자동 종료시키는 추가 Celery 작업을 걸어둘 수도 있습니다.

        return f"{equipment.name}의 자동 종료 작업이 처리되었습니다."
    except UsageLog.DoesNotExist:
        return "사용 기록이 이미 삭제되어 작업을 실행할 수 없습니다."