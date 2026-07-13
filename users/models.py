from django.db import models
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError


def validate_image_size(image):
    max_size_mb = 5
    if image.size > max_size_mb * 1024 * 1024:
        raise ValidationError(f"Размер файла не должен превышать {max_size_mb}MB")


class Profile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    display_name = models.CharField(max_length=100, blank=True)
    group_name = models.CharField(max_length=50, blank=True)
    avatar = models.ImageField(upload_to='avatars/', blank=True, null=True, validators=[validate_image_size])
    is_verified = models.BooleanField(default=False)
    is_organizer = models.BooleanField(default=False)
    dark_mode = models.BooleanField(default=False)
    banner = models.ImageField(upload_to='banners/', blank=True, null=True, validators=[validate_image_size])
    banner_position = models.PositiveSmallIntegerField(default=50)

    def __str__(self):
        return self.user.username


class Follow(models.Model):
    follower = models.ForeignKey(User, on_delete=models.CASCADE, related_name='following')
    following = models.ForeignKey(User, on_delete=models.CASCADE, related_name='followers')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('follower', 'following')

    def __str__(self):
        return f"{self.follower.username} → {self.following.username}"
