"""Отправка Web Push-уведомлений.

Работает по схеме PWA: на iOS 16.4+ уведомления приходят только если сайт
добавлен на экран «Домой». Отправка идёт в фоновом потоке, чтобы задержки
push-сервиса (APNs/FCM) не тормозили ответ Django.
"""

import json
import logging
import os
import threading

from django.conf import settings
from django.db import close_old_connections
from django.utils import timezone, translation
from django.utils.translation import gettext as _

logger = logging.getLogger(__name__)

ICON_URL = '/static/icons/icon-192.png?v=2'


def _vapid_key():
    """Vapid-объект из base64url-ключа или пути к PEM-файлу."""
    from py_vapid import Vapid

    key = settings.VAPID_PRIVATE_KEY
    if os.path.exists(key):
        return Vapid.from_file(key)
    return Vapid.from_string(key)


def _send_sync(subscriptions, payload, urgency='normal'):
    from pywebpush import WebPushException, webpush

    from .models import PushSubscription

    close_old_connections()
    try:
        vapid = _vapid_key()
        contact = settings.VAPID_ADMIN_EMAIL or 'mailto:admin@example.com'
        if not contact.startswith(('mailto:', 'https://')):
            contact = 'mailto:' + contact
        claims = {'sub': contact}
        headers = {'Urgency': urgency}

        for sub in subscriptions:
            try:
                webpush(
                    subscription_info=sub.as_subscription_info(),
                    data=payload,
                    vapid_private_key=vapid,
                    vapid_claims=dict(claims),
                    headers=dict(headers),
                    ttl=86400,
                    timeout=15,
                )
                PushSubscription.objects.filter(pk=sub.pk).update(
                    last_seen=timezone.now(),
                )
            except WebPushException as exc:
                status = getattr(exc.response, 'status_code', None)
                if status in (404, 410):
                    # Браузер отозвал подписку — чистим, чтобы не копить мусор.
                    PushSubscription.objects.filter(pk=sub.pk).delete()
                else:
                    logger.warning('Web push failed (%s): %s', status, exc)
            except Exception:
                logger.exception('Web push failed for %s', sub.endpoint[:60])
    finally:
        close_old_connections()


def send_to_user(user, title, body, url='/', tag=None, icon=ICON_URL,
                 urgency='normal'):
    """Отправляет push на все устройства пользователя (не блокирует запрос)."""
    if not getattr(settings, 'WEBPUSH_ENABLED', False):
        return 0

    subscriptions = list(user.push_subscriptions.all())
    if not subscriptions:
        return 0

    payload = json.dumps(
        {
            'title': title,
            'body': body or '',
            'url': url,
            'tag': tag or '',
            'icon': icon,
        },
        ensure_ascii=False,
    )

    thread = threading.Thread(
        target=_send_sync,
        args=(subscriptions, payload, urgency),
        daemon=True,
    )
    thread.start()
    return len(subscriptions)


def notify_new_message(message, sender):
    """Push получателям нового сообщения в чате."""
    if not getattr(settings, 'WEBPUSH_ENABLED', False):
        return

    url = f'/chat/{message.chat_id}/'
    tag = f'chat-{message.chat_id}'

    for recipient in message.chat.participants.exclude(pk=sender.pk):
        text = message.text_for(recipient).strip()
        if len(text) > 140:
            text = text[:137] + '…'
        lang = getattr(getattr(recipient, 'profile', None), 'language', None)
        with translation.override(lang or settings.LANGUAGE_CODE):
            fallback = _('Новое сообщение')
        send_to_user(
            recipient,
            title=sender.username,
            body=text or fallback,
            url=url,
            tag=tag,
            urgency='high',
        )
