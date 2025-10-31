# equipment/models.py

from django.db import models
from gyms.models import Gym

class Equipment(models.Model):
    gym = models.ForeignKey(Gym, on_delete=models.CASCADE)
    name = models.CharField(max_length=100)
    
    TYPE_CHOICES = [
        ('CARDIO', 'Cardio'),
        ('STRENGTH', 'Strength'),
        ('ETC', 'Etc'),
    ]
    type = models.CharField(max_length=50, choices=TYPE_CHOICES)
    
    nfc_tag_id = models.CharField(max_length=100, unique=True)
    arduino_id = models.CharField(max_length=100, unique=True)
    
    STATUS_CHOICES = [
        ('AVAILABLE', 'Available'),
        ('IN_USE', 'In Use'),
        ('OUT_OF_ORDER', 'Out of Order'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='AVAILABLE')
    base_session_time_minutes = models.IntegerField(default=15)

    def __str__(self):
        return f'{self.gym.name} - {self.name}'