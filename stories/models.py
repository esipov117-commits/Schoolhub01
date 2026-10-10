from django.db import models
from django.conf import settings
from django.utils import timezone
from users.models import validate_image_size, validate_video_size


class Story(models.Model):
    MEDIA_PHOTO = 'photo'
    MEDIA_VIDEO = 'video'
    MEDIA_TYPES = [
        (MEDIA_PHOTO, 'Фото'),
        (MEDIA_VIDEO, 'Видео'),
    ]

    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='stories',
    )
    media_type = models.CharField(max_length=10, choices=MEDIA_TYPES)
    image = models.ImageField(upload_to='stories/', blank=True, null=True, validators=[validate_image_size])
    video = models.FileField(upload_to='stories/', blank=True, null=True, validators=[validate_video_size])
    caption = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['-created_at']),
            models.Index(fields=['expires_at']),
        ]

    def save(self, *args, **kwargs):
        if not self.expires_at:
            self.expires_at = timezone.now() + timezone.timedelta(hours=24)
        super().save(*args, **kwargs)

    @property
    def is_expired(self):
        return timezone.now() >= self.expires_at
