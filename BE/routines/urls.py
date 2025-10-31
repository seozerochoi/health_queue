# routines/urls.py
from django.urls import path
from .views import GenerateRoutineView

urlpatterns = [
    path('generate/', GenerateRoutineView.as_view(), name='generate-routine'),
]