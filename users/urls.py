from django.urls import path
from . import views

urlpatterns = [
    path("", views.home, name="home"),  # ← ДОБАВЬ ЭТО
    path("register/", views.register, name="register"),
    path("profile/", views.profile, name="profile"),
    path("edit/", views.edit_profile, name="edit_profile"),
]