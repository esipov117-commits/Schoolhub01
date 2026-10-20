"""Middleware для активации языка, выбранного в профиле пользователя.

Django из коробки определяет язык по заголовку `Accept-Language` и cookie
сессии. Нам же нужно, чтобы язык хранился в `Profile.language` и применялся
для всех страниц, включая SPA-переходы.
"""

from django.conf import settings
from django.utils import translation


class LanguageMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        language = None
        user = getattr(request, 'user', None)
        if user is not None and user.is_authenticated:
            profile = getattr(user, 'profile', None)
            if profile is not None:
                language = profile.language

        if language and language in dict(settings.LANGUAGES):
            translation.activate(language)
            request.LANGUAGE_CODE = language

        response = self.get_response(request)
        translation.deactivate()
        return response
