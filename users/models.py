from django.db import models
from django.contrib.auth.models import User

class Profile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    display_name = models.CharField(max_length=100, blank=True)
    group_name = models.CharField(max_length=50, blank=True)
    avatar = models.ImageField(upload_to='avatars/', blank=True, null=True)
    is_verified = models.BooleanField(default=False)
    is_organizer = models.BooleanField(default=False)
    dark_mode = models.BooleanField(default=False)
    banner = models.ImageField(upload_to='banners/', blank=True, null=True)
    banner_position = models.PositiveSmallIntegerField(default=50)
    def __str__(self):
        return self.user.username
