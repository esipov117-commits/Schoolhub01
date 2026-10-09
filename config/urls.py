from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
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
    path("calendar/", include("planner.urls")),
    path("tasks/", include("tasks.urls")),
    path('stories/', include('stories.urls')),
]

# static() отдаёт /media/ только при DEBUG — в продакшене загруженные фото
# постов и историй иначе отдают 404. Если /media/ уже обслуживает nginx,
# этот маршрут просто не используется.
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
urlpatterns += [
    path(
        'media/<path:path>',
        serve,
        {'document_root': settings.MEDIA_ROOT},
        name='serve_media',
    ),
]
