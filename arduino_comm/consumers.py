import json
from channels.generic.websocket import WebsocketConsumer

class ArduinoConsumer(WebsocketConsumer):
    # 아두이노가 웹소켓에 연결을 시도할 때 호출
    def connect(self):
        # URL에서 equipment_id를 가져옵니다. (예: ws://.../ws/arduino/5/)
        self.equipment_id = self.scope['url_route']['kwargs']['equipment_id']
        self.room_group_name = f'equipment_{self.equipment_id}'

        # 이 기구만의 '채팅방(그룹)'에 참여시킵니다.
        # 이렇게 해야 특정 기구에만 메시지를 보낼 수 있습니다.
        self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        self.accept()
        print(f"Arduino for equipment {self.equipment_id} connected.")

    # 연결이 끊겼을 때 호출
    def disconnect(self, close_code):
        self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )
        print(f"Arduino for equipment {self.equipment_id} disconnected.")

    # 서버의 다른 곳에서 이 Consumer로 메시지를 보냈을 때 호출
    # (예: views.py에서 '잠금 해제' 명령을 보냈을 때)
    def send_command(self, event):
        command = event['command']
        # 아두이노에게 JSON 형태로 명령을 전송합니다.
        self.send(text_data=json.dumps({
            'command': command
        }))