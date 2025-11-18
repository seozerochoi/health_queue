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

from workouts.views import HeartbeatView

urlpatterns = [
    path('admin/', admin.site.urls),

    # 회원가입, 로그인, 토큰 갱신 API - moved to users/urls.py to avoid eager import
    # These paths now use include() which defers view imports until request time
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # Direct heartbeat entry point ensures FE always hits a stable URL
    path('api/workouts/heartbeat/', HeartbeatView.as_view(), name='session-heartbeat'),
    
    # 기존에 만들었던 다른 앱들의 URL들
    path('api/', include('users.urls')), # users.urls를 'api/' 하위로 변경
    path('api/', include('gyms.urls')),
    path('api/', include('equipment.urls')),
    path('api/', include('workouts.urls')),
    path('api/', include('reports.urls')),
    path('api/routines/', include('routines.urls')),
]
