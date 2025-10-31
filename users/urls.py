from django.urls import path
from .views import UserRegistrationAPIView
from rest_framework_simplejwt.views import (
    TokenObtainPairView,  # 로그인(토큰 발급)
    TokenRefreshView,     # 토큰 재발급
)

urlpatterns = [
    path('register/', UserRegistrationAPIView.as_view(), name='register'),
    path('login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('login/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
]