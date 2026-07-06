from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import TemplateView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('accounts/', include('django.contrib.auth.urls')),
    path('', include('users.urls')),
    path('', include('posts.urls')),
    path('', TemplateView.as_view(template_name='welcome.html'), name='landing'),
]