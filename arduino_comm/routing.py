from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    # ws://서버주소/ws/arduino/기구ID/ 형태의 주소로 접속하면 ArduinoConsumer 실행
    re_path(r'ws/arduino/(?P<equipment_id>\w+)/$', consumers.ArduinoConsumer.as_asgi()),
]