from django.urls import path
from .views import settings_view, toggle_theme

urlpatterns = [
    path("", settings_view, name="settings"),
    path("theme/", toggle_theme, name="toggle_theme"),
]