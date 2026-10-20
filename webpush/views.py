import json

from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.http import FileResponse, JsonResponse
from django.views.decorators.http import require_POST
from django.utils.translation import gettext as _

from .models import PushSubscription


def _json_body(request):
    try:
        return json.loads(request.body.decode('utf-8') or '{}')
    except (ValueError, UnicodeDecodeError):
        return None


def _no_cache(response):
    response['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    return response


@login_required
@require_POST
def subscribe(request):
    data = _json_body(request)
    if not isinstance(data, dict):
        return JsonResponse({'ok': False, 'error': _('Некорректный JSON')}, status=400)

    endpoint = (data.get('endpoint') or '').strip()
    keys = data.get('keys') or {}
    p256dh = (keys.get('p256dh') or '').strip()
    auth = (keys.get('auth') or '').strip()

    if not endpoint.startswith('https://') or not p256dh or not auth:
        return JsonResponse(
            {'ok': False, 'error': 'Некорректная подписка'},
            status=400,
        )

    sub, created = PushSubscription.upsert(
        user=request.user,
        endpoint=endpoint,
        p256dh=p256dh,
        auth=auth,
        user_agent=request.META.get('HTTP_USER_AGENT', ''),
    )
    return JsonResponse({'ok': True, 'created': created, 'id': sub.pk})


@login_required
@require_POST
def unsubscribe(request):
    data = _json_body(request)
    if not isinstance(data, dict):
        return JsonResponse({'ok': False, 'error': _('Некорректный JSON')}, status=400)

    endpoint = (data.get('endpoint') or '').strip()
    if endpoint:
        PushSubscription.objects.filter(
            user=request.user,
            endpoint_hash=PushSubscription.hash_endpoint(endpoint),
        ).delete()
    return JsonResponse({'ok': True})


def service_worker(request):
    """Service worker отдаётся с корня, чтобы его scope был «/»."""
    response = FileResponse(
        open(settings.BASE_DIR / 'static' / 'js' / 'sw.js', 'rb'),
        content_type='application/javascript; charset=utf-8',
    )
    response['Service-Worker-Allowed'] = '/'
    return _no_cache(response)


def manifest(request):
    response = FileResponse(
        open(settings.BASE_DIR / 'static' / 'manifest.webmanifest', 'rb'),
        content_type='application/manifest+json',
    )
    return _no_cache(response)
