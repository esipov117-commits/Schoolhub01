from django.conf import settings


def webpush(request):
    enabled = getattr(settings, 'WEBPUSH_ENABLED', False)
    return {
        'webpush_enabled': enabled,
        'vapid_public_key': settings.VAPID_PUBLIC_KEY if enabled else '',
    }
