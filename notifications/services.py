from django.conf import settings
import firebase_admin
from firebase_admin import credentials, messaging

# --- Firebase Admin SDK 초기화 ---
# settings.py에 설정한 JSON 파일 경로를 가져옵니다.
cred = credentials.Certificate(settings.FIREBASE_SERVICE_ACCOUNT_KEY)

# Django 개발 서버는 리로드될 때마다 코드를 다시 실행해서,
# 이미 초기화되었다는 에러가 발생할 수 있습니다.
# 그래서 아래와 같이 앱이 아직 초기화되지 않았을 때만 초기화하도록 설정합니다.
if not firebase_admin._apps:
    firebase_admin.initialize_app(cred)


def send_push_notification(user_fcm_token: str, title: str, body: str):
    """
    특정 사용자에게 푸시 알림을 보냅니다. (firebase-admin 방식)
    """
    if not user_fcm_token:
        print("FCM 토큰이 없어 알림을 보낼 수 없습니다.")
        return False

    try:
        # 알림 메시지 구성
        message = messaging.Message(
            notification=messaging.Notification(
                title=title,
                body=body,
            ),
            token=user_fcm_token, # 알림을 보낼 사용자의 기기 토큰
        )

        # 메시지 발송
        response = messaging.send(message)

        print(f"알림 전송 성공: {response}")
        return True
    except Exception as e:
        print(f"알림 전송 실패: {e}")
        return False