from django.contrib import admin
from .models import Profile, Follow

@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'display_name', 'is_verified', 'is_donor', 'is_organizer')
    list_editable = ('is_verified', 'is_donor', 'is_organizer')
    search_fields = ('user__username', 'display_name')

admin.site.register(Follow)