from django.urls import path
from . import views

urlpatterns = [
    path('events/', views.events_list, name='events_list'),
    path('events/create/', views.create_event, name='create_event'),
]