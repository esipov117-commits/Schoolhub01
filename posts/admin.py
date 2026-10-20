from django.contrib import admin
from .models import Post, PostImage, Like, Comment


class PostImageInline(admin.TabularInline):
    model = PostImage
    extra = 0


@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ('id', 'author', 'content', 'created_at', 'edited_at')
    list_filter = ('created_at', 'layout')
    search_fields = ('author__username', 'content')
    inlines = [PostImageInline]
    actions = ['delete_selected']


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ('id', 'post', 'author', 'text', 'created_at')
    search_fields = ('author__username', 'text', 'post__id')


@admin.register(Like)
class LikeAdmin(admin.ModelAdmin):
    list_display = ('user', 'post', 'created_at')
    search_fields = ('user__username', 'post__id')
