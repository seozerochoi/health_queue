from rest_framework import serializers
from .models import WaitlistEntry

class WaitlistEntrySerializer(serializers.ModelSerializer):
    # 대기열 정보를 보여줄 때 사용자 이메일도 함께 보여주기 위함
    user_email = serializers.EmailField(source='user.email', read_only=True)

    class Meta:
        model = WaitlistEntry
        fields = ['id', 'user_email', 'equipment', 'timestamp']