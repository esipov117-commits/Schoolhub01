from django.contrib import admin

from .models import PushSubscription


@admin.register(PushSubscription)
class PushSubscriptionAdmin(admin.ModelAdmin):
    list_display = ('user', 'short_endpoint', 'created_at', 'last_seen')
    list_filter = ('created_at', 'last_seen')
    search_fields = ('user__username', 'endpoint', 'endpoint_hash')
    readonly_fields = ('endpoint_hash', 'created_at', 'last_seen')

    @admin.display(description='Endpoint')
    def short_endpoint(self, obj):
        return f'{obj.endpoint[:60]}…'
