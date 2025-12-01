from django.contrib import admin
from .models import Report, EquipmentDailyStats


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    list_display = ('id', 'reporter', 'reported_user', 'equipment', 'report_type', 'status', 'created_at')
    list_filter = ('report_type', 'status', 'created_at')
    search_fields = ('reporter__username', 'reported_user__username', 'reason')
    readonly_fields = ('created_at',)


@admin.register(EquipmentDailyStats)
class EquipmentDailyStatsAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'equipment', 'date', 'usage_count', 'total_usage_minutes', 'average_time_minutes'
    )
    list_filter = ('date', 'equipment__gym')
    search_fields = ('equipment__name',)
    readonly_fields = ('average_time_minutes', 'created_at', 'updated_at')

