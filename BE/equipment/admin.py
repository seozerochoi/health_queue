from django.contrib import admin
from .models import Equipment


@admin.register(Equipment)
class EquipmentAdmin(admin.ModelAdmin):
	list_display = (
		'id', 'name', 'gym', 'type', 'body_part', 'subcategory', 'status', 'operational_state'
	)
	list_filter = (
		'gym', 'type', 'body_part', 'subcategory', 'status', 'operational_state'
	)
	search_fields = ('name', 'nfc_tag_id', 'arduino_id')
