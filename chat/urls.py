from django.urls import path
from . import views

urlpatterns = [
    path('chat/', views.chat_list, name='chat'),
    path('chat/new/', views.start_chat, name='start_chat'),
    path('chat/api/unread/', views.unread_api, name='unread_api'),
    path('chat/<int:chat_id>/', views.chat_room, name='chat_room'),
    path('chat/<int:chat_id>/send/', views.send_message, name='send_message'),
    path('chat/<int:chat_id>/poll/', views.poll_messages, name='poll_messages'),
]
