from django.conf import settings
from django.contrib import admin
from django.http import Http404
from django.urls import include, path
from django.views.static import serve

from users.views import login_view

urlpatterns = [
    path('admin/', admin.site.urls),
    path('accounts/login/', login_view, name='login'),
    path('accounts/', include('django.contrib.auth.urls')),
    path('', include('users.urls')),
    path('', include('posts.urls')),
    path('', include('events.urls')),
    path('', include('chat.urls')),
    path('tasks/', include('tasks.urls')),
    path('stories/', include('stories.urls')),
    path('', include('webpush.urls')),
]


def serve_public_media(request, path):
    """Публичное MEDIA, кроме старых вложений чата.

    Новые вложения чата лежат вне MEDIA_ROOT и отдаются только через
    chat.views.chat_attachment после проверки участия в чате. Этот запрет
    закрывает старый путь /media/chat_uploads/ на случай прямого запроса
    к Django мимо nginx.
    """
    if path.startswith('chat_uploads/'):
        raise Http404
    return serve(request, path, document_root=settings.MEDIA_ROOT)


urlpatterns += [
    path('media/<path:path>', serve_public_media, name='serve_media'),
]
