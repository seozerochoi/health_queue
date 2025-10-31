# users/urls.py

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import UserViewSet

# API URL을 자동으로 생성해주는 라우터를 생성합니다.
router = DefaultRouter()
router.register(r'users', UserViewSet) # 'users' 경로에 UserViewSet을 등록

urlpatterns = [
    path('', include(router.urls)),
]