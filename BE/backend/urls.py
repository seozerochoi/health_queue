"""
URL configuration for backend project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include

# 1. 기본 TokenObtainPairView 대신, 우리가 만든 MyTokenObtainPairView를 임포트합니다.
from rest_framework_simplejwt.views import TokenRefreshView
from users.views import RegisterView, MyTokenObtainPairView  # <--- 여기를 수정!
from users.views import UserProfileView # 프로필 뷰도 임포트 (이전 단계에서 추가함)

urlpatterns = [
    path('admin/', admin.site.urls),

    # --- 회원가입, 로그인, 프로필 API ---
    path('api/register/', RegisterView.as_view(), name='register'),
    
    # 2. /api/login/ 경로가 우리 뷰를 사용하도록 수정합니다.
    path('api/login/', MyTokenObtainPairView.as_view(), name='token_obtain_pair'), # <--- 여기를 수정!
    
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/profile/', UserProfileView.as_view(), name='user-profile'),


    # --- 기존에 만들었던 다른 앱들의 URL들 ---
    path('api/', include('users.urls')),
    path('api/', include('gyms.urls')),
    path('api/', include('equipment.urls')),
    path('api/', include('workouts.urls')),
    path('api/', include('reports.urls')),
    path('api/routines/', include('routines.urls')),
]