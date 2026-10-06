from django.urls import path
from . import views

urlpatterns = [
    path('', views.stories_bar, name='stories_bar'),
    path('upload/', views.upload_story, name='upload_story'),
    path('api/active/', views.api_active_stories, name='api_active_stories'),
    path('<int:story_id>/delete/', views.delete_story, name='delete_story'),
]
