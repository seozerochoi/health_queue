from django.urls import path
from .views import IdealTimeAPIView

urlpatterns = [
    path('ideal-time/<int:equipment_id>/', IdealTimeAPIView.as_view(), name='ideal-time'),
]