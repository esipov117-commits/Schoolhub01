from django.db import models
from django.contrib.auth.models import User
from users.models import validate_image_size


class Event(models.Model):
    title = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    date = models.DateTimeField()
    location = models.CharField(max_length=200, blank=True)
    image = models.ImageField(upload_to='events/', blank=True, null=True, validators=[validate_image_size])
    created_by = models.ForeignKey(User, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['date']
        indexes = [
            models.Index(fields=['date']),
        ]

    def __str__(self):
        return self.title
