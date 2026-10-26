from django.contrib import admin

from .models import Story, StoryLike, StoryView


@admin.register(Story)
class StoryAdmin(admin.ModelAdmin):
    list_display = ('id', 'author', 'media_type', 'caption', 'created_at', 'expires_at', 'is_expired')
    list_filter = ('media_type', 'created_at', 'expires_at')
    search_fields = ('author__username', 'caption')
    actions = ('delete_selected',)


@admin.register(StoryLike)
class StoryLikeAdmin(admin.ModelAdmin):
    list_display = ('user', 'story', 'created_at')
    search_fields = ('user__username', 'story__id')


@admin.register(StoryView)
class StoryViewAdmin(admin.ModelAdmin):
    list_display = ('user', 'story', 'viewed_at')
    search_fields = ('user__username', 'story__id')
