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
# Simple JWT가 제공하는 View들을 import 합니다.
from rest_framework_simplejwt.views import TokenRefreshView
# 우리가 만든 RegisterView, get_current_user, MyTokenObtainPairView를 import 합니다.
from users.views import RegisterView, get_current_user, MyTokenObtainPairView

urlpatterns = [
    path('admin/', admin.site.urls),

    # 회원가입, 로그인, 토큰 갱신 API
    path('api/register/', RegisterView.as_view(), name='register'),
    path('api/login/', MyTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/user/me/', get_current_user, name='current_user'),
    
    # 기존에 만들었던 다른 앱들의 URL들
    path('api/', include('users.urls')), # users.urls를 'api/' 하위로 변경
    path('api/', include('gyms.urls')),
    path('api/', include('equipment.urls')),
    path('api/', include('workouts.urls')),
    path('api/', include('reports.urls')),
    path('api/routines/', include('routines.urls')),
]
