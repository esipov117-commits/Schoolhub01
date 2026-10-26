from typing import ClassVar

from django.conf import settings
from django.db import models
from django.utils import timezone

from users.models import validate_image_size, validate_video_size


class Story(models.Model):
    MEDIA_PHOTO = 'photo'
    MEDIA_VIDEO = 'video'
    MEDIA_TYPES: ClassVar[list[tuple[str, str]]] = [
        (MEDIA_PHOTO, 'Фото'),
        (MEDIA_VIDEO, 'Видео'),
    ]

    FIT_CONTAIN = 'contain'
    FIT_COVER = 'cover'
    FIT_MODES: ClassVar[list[tuple[str, str]]] = [
        (FIT_CONTAIN, 'Вся картинка'),
        (FIT_COVER, 'Заполнить экран'),
    ]

    BACKGROUND_BLUR = 'blur'
    BACKGROUND_BLACK = 'black'
    BACKGROUND_MODES: ClassVar[list[tuple[str, str]]] = [
        (BACKGROUND_BLUR, 'Размытое медиа'),
        (BACKGROUND_BLACK, 'Чёрный фон'),
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
    fit_mode = models.CharField(max_length=10, choices=FIT_MODES, default=FIT_CONTAIN)
    background_mode = models.CharField(max_length=10, choices=BACKGROUND_MODES, default=BACKGROUND_BLUR)
    focus_x = models.PositiveSmallIntegerField(default=50)
    focus_y = models.PositiveSmallIntegerField(default=50)
    zoom = models.PositiveSmallIntegerField(default=100)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    class Meta:
        ordering: ClassVar[list[str]] = ['-created_at']
        indexes: ClassVar[list] = [
            models.Index(fields=['-created_at']),
            models.Index(fields=['expires_at']),
        ]

    def __str__(self):
        return f'История {self.pk} от {self.author}'

    def save(self, *args, **kwargs):
        if not self.expires_at:
            self.expires_at = timezone.now() + timezone.timedelta(hours=24)
        super().save(*args, **kwargs)

    @property
    def is_expired(self):
        return timezone.now() >= self.expires_at


class StoryLike(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='story_likes',
    )
    story = models.ForeignKey(
        Story,
        on_delete=models.CASCADE,
        related_name='likes',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'story')

    def __str__(self):
        return f'{self.user} лайкнул историю {self.story_id}'


class StoryView(models.Model):
    story = models.ForeignKey(
        Story,
        on_delete=models.CASCADE,
        related_name='views',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='story_views',
    )
    viewed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=['story', 'user'],
                name='uniq_story_view_user',
            ),
        ]
        indexes: ClassVar[list] = [models.Index(fields=['user', 'story'])]

    def __str__(self):
        return f'{self.user} просмотрел историю {self.story_id}'
