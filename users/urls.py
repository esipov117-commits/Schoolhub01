from django.urls import path
from . import views

urlpatterns = [
    path("", views.home, name="home"),
    path("register/", views.register, name="register"),
    path("profile/edit/", views.edit_profile, name="edit_profile"),
    path("profile/", views.profile, name="profile"),
    path("profile/<str:username>/follow/", views.toggle_follow, name="toggle_follow"),
    path("profile/<str:username>/", views.profile, name="profile_user"),
    path("toggle-theme/", views.toggle_theme, name="toggle_theme"),
    path("search/", views.search_users, name="search_users"),
    path("profile/<str:username>/followers/", views.followers_list, name="followers_list"),
    path("profile/<str:username>/following/", views.following_list, name="following_list"),
]
