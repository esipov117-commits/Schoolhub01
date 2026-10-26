from django.urls import path

from . import views

urlpatterns = [
    path('', views.stories_bar, name='stories_bar'),
    path('upload/', views.upload_story, name='upload_story'),
    path('api/active/', views.api_active_stories, name='api_active_stories'),
    path('api/view/<int:story_id>/', views.view_story, name='view_story'),
    path('api/like/<int:story_id>/', views.toggle_story_like, name='toggle_story_like'),
    path('api/stats/<int:story_id>/', views.story_stats, name='story_stats'),
    path('<int:story_id>/delete/', views.delete_story, name='delete_story'),
]
