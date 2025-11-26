from django.contrib import admin
from .models import InbodyRecord, UserProfile


@admin.register(InbodyRecord)
class InbodyRecordAdmin(admin.ModelAdmin):
	list_display = ('id', 'user', 'source', 'created_at')
	list_filter = ('source', 'created_at')
	search_fields = ('user__username',)


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
	list_display = ('id', 'user', 'role', 'weight_kg', 'height_cm', 'bmi')
	search_fields = ('user__username',)

# Register your models here.
