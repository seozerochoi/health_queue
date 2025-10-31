"""
ASGI config for Back project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.2/howto/deployment/asgi/
"""

import os
from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application
import arduino_comm.routing # 8번 항목에서 만들 파일

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'Back.settings')

application = ProtocolTypeRouter({
  "http": get_asgi_application(),
  "websocket": AuthMiddlewareStack( # WebSocket 요청 시 사용자 인증
        URLRouter(
            arduino_comm.routing.websocket_urlpatterns
        )
    ),
})