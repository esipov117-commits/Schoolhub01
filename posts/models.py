from django.db import models
from django.contrib.auth.models import User
from users.models import validate_image_size, validate_video_size


class Post(models.Model):
    LAYOUT_CHOICES = [
        ('carousel', 'Carousel'),
        ('grid', 'Grid'),
    ]

    author = models.ForeignKey(User, on_delete=models.CASCADE)
    content = models.TextField(blank=True)
    layout = models.CharField(max_length=10, choices=LAYOUT_CHOICES, default='carousel')
    created_at = models.DateTimeField(auto_now_add=True)
    edited_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['-created_at']),
        ]

    def __str__(self):
        return f"{self.author.username}: {self.content[:50]}..."


class PostImage(models.Model):
    MEDIA_TYPE_CHOICES = [
        ('image', 'Image'),
        ('video', 'Video'),
    ]

    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='images')
    image = models.ImageField(upload_to='posts/', blank=True, null=True, validators=[validate_image_size])
    video = models.FileField(upload_to='posts/videos/', blank=True, null=True, validators=[validate_video_size])
    media_type = models.CharField(max_length=10, choices=MEDIA_TYPE_CHOICES, default='image')
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return f"{self.media_type} for post {self.post_id}"

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


class Comment(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='comments')
    author = models.ForeignKey(User, on_delete=models.CASCADE)
    text = models.CharField(max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['post', 'created_at']),
        ]

    def __str__(self):
        return f"{self.author.username} on post {self.post_id}: {self.text[:30]}"