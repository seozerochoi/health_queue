from django.db import models
from users.models import User
from gyms.models import Equipment

class Report(models.Model):
    class ReportType(models.TextChoices):
        EQUIPMENT = "EQUIPMENT", "기구 고장"
        USER = "USER", "사용자 위반"

    class Status(models.TextChoices):
        PENDING = "PENDING", "처리 대기"
        RESOLVED = "RESOLVED", "처리 완료"

    reporter = models.ForeignKey(User, on_delete=models.CASCADE, related_name='filed_reports')
    report_type = models.CharField(max_length=10, choices=ReportType.choices)
    reported_user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='received_reports')
    equipment = models.ForeignKey(Equipment, on_delete=models.SET_NULL, null=True, blank=True)
    content = models.TextField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)