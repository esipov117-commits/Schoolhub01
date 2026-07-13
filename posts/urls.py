from django.urls import path
from . import views

urlpatterns = [
    path('feed/', views.feed, name='feed'),
    path('feed/<int:post_id>/like/', views.toggle_like, name='toggle_like'),
    path('feed/<int:post_id>/delete/', views.delete_post, name='delete_post'),
]