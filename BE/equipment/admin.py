from django.contrib import admin
from .models import Equipment
from .daily_stats_models import EquipmentDailyStats


@admin.register(Equipment)
class EquipmentAdmin(admin.ModelAdmin):
	list_display = (
		'id', 'name', 'gym', 'type', 'body_part', 'subcategory', 'status', 'operational_state'
	)
	list_filter = (
		'gym', 'type', 'body_part', 'subcategory', 'status', 'operational_state'
	)
	search_fields = ('name', 'nfc_tag_id', 'arduino_id')


@admin.register(EquipmentDailyStats)
class EquipmentDailyStatsAdmin(admin.ModelAdmin):
	list_display = (
		'id', 'equipment', 'date', 'usage_count', 'total_usage_minutes', 'average_time_minutes'
	)
	list_filter = ('date', 'equipment__gym')
	search_fields = ('equipment__name',)
	readonly_fields = ('average_time_minutes', 'created_at', 'updated_at')
