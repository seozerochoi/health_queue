# users/urls.py

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import UserViewSet, current_user_profile

# API URL을 자동으로 생성해주는 라우터를 생성합니다.
router = DefaultRouter()
router.register(r'users', UserViewSet) # 'users' 경로에 UserViewSet을 등록

urlpatterns = [
    # 주의: 'users/<pk>/' 라우트보다 'users/profile/'가 먼저 매칭되도록 순서 중요
    path('users/profile/', current_user_profile, name='current_user_profile'),
    path('', include(router.urls)),
]