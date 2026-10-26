import hashlib
from typing import ClassVar

from django.contrib.auth.models import User
from django.db import models
from django.utils import timezone


class PushSubscription(models.Model):
    """Подписка устройства на Web Push (PWA на iOS, Android, десктоп)."""

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='push_subscriptions',
    )
    endpoint = models.TextField()
    # push-сервисы иногда отдают очень длинные endpoint'ы, поэтому уникальный
    # индекс держим на sha256, а сам URL храним в TextField без индекса.
    endpoint_hash = models.CharField(max_length=64, unique=True, editable=False)
    p256dh = models.CharField(max_length=255)
    auth = models.CharField(max_length=255)
    user_agent = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField(default=timezone.now)

    class Meta:
        verbose_name = 'Push-подписка'
        verbose_name_plural = 'Push-подписки'
        indexes: ClassVar[list] = [models.Index(fields=['user'])]

    def __str__(self):
        return f'{self.user} · {self.endpoint[:40]}…'

    def save(self, *args, **kwargs):
        if not self.endpoint_hash:
            self.endpoint_hash = self.hash_endpoint(self.endpoint)
        super().save(*args, **kwargs)

    @staticmethod
    def hash_endpoint(endpoint):
        return hashlib.sha256(endpoint.encode('utf-8')).hexdigest()

    @classmethod
    def upsert(cls, user, endpoint, p256dh, auth, user_agent=''):
        sub, created = cls.objects.update_or_create(
            endpoint_hash=cls.hash_endpoint(endpoint),
            defaults={
                'user': user,
                'endpoint': endpoint,
                'p256dh': p256dh,
                'auth': auth,
                'user_agent': (user_agent or '')[:255],
                'last_seen': timezone.now(),
            },
        )
        return sub, created

    def as_subscription_info(self):
        return {
            'endpoint': self.endpoint,
            'keys': {
                'p256dh': self.p256dh,
                'auth': self.auth,
            },
        }
