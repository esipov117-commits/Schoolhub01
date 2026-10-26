from typing import ClassVar

from django.contrib.auth.models import User
from django.db import models

from users.models import validate_image_size, validate_video_size


class Post(models.Model):
    LAYOUT_CHOICES: ClassVar[list[tuple[str, str]]] = [
        ('carousel', 'Carousel'),
        ('grid', 'Grid'),
    ]

    author = models.ForeignKey(User, on_delete=models.CASCADE)
    content = models.TextField(blank=True)
    layout = models.CharField(max_length=10, choices=LAYOUT_CHOICES, default='carousel')
    created_at = models.DateTimeField(auto_now_add=True)
    edited_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering: ClassVar[list[str]] = ['-created_at']
        indexes: ClassVar[list] = [models.Index(fields=['-created_at'])]

    def __str__(self):
        return f'{self.author.username}: {self.content[:50]}...'


class PostImage(models.Model):
    MEDIA_TYPE_CHOICES: ClassVar[list[tuple[str, str]]] = [
        ('image', 'Image'),
        ('video', 'Video'),
    ]

    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='images')
    image = models.ImageField(
        upload_to='posts/',
        blank=True,
        null=True,
        validators=[validate_image_size],
        width_field='width',
        height_field='height',
    )
    video = models.FileField(upload_to='posts/videos/', blank=True, null=True, validators=[validate_video_size])
    media_type = models.CharField(max_length=10, choices=MEDIA_TYPE_CHOICES, default='image')
    order = models.PositiveSmallIntegerField(default=0)
    width = models.PositiveIntegerField(null=True, blank=True)
    height = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        ordering: ClassVar[list[str]] = ['order', 'id']

    def __str__(self):
        return f'{self.media_type} for post {self.post_id}'

    @property
    def url(self):
        if self.media_type == 'video':
            return self.video.url if self.video else ''
        return self.image.url if self.image else ''


class Like(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='likes')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'post')

    def __str__(self):
        return f'{self.user} лайкнул пост {self.post_id}'


class PostView(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='post_views')
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='views')
    viewed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=['post', 'user'],
                name='uniq_post_view_user',
            ),
        ]
        indexes: ClassVar[list] = [models.Index(fields=['post'])]

    def __str__(self):
        return f'{self.user.username} viewed post {self.post_id}'


class PostShare(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='shares')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'post')

    def __str__(self):
        return f'{self.user} поделился постом {self.post_id}'


class Comment(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='comments')
    author = models.ForeignKey(User, on_delete=models.CASCADE)
    text = models.CharField(max_length=500)
    parent = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name='replies',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering: ClassVar[list[str]] = ['created_at']
        indexes: ClassVar[list] = [
            models.Index(fields=['post', 'created_at']),
            models.Index(fields=['post', 'parent', 'created_at']),
        ]

    def __str__(self):
        return f'{self.author.username} on post {self.post_id}: {self.text[:30]}'

    @property
    def is_reply(self):
        return self.parent_id is not None

    @property
    def root(self):
        return self.parent if self.parent_id else self
