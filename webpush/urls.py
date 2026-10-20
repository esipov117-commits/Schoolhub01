from django.urls import path

from . import views

urlpatterns = [
    path('push/subscribe/', views.subscribe, name='push_subscribe'),
    path('push/unsubscribe/', views.unsubscribe, name='push_unsubscribe'),
    path('sw.js', views.service_worker, name='service_worker'),
    path('manifest.webmanifest', views.manifest, name='manifest'),
]
