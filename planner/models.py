from django.db import models
from django.contrib.auth.models import User


class CalendarEvent(models.Model):

    EVENT_TYPES = (
        ("personal", "Личное"),
        ("school", "Школа"),
        ("tutor", "Репетитор"),
        ("hub", "SchoolHub"),
    )


    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE
    )

    title = models.CharField(
        max_length=200
    )

    description = models.TextField(
        blank=True
    )

    date = models.DateField()

    start_time = models.TimeField(
        null=True,
        blank=True
    )

    end_time = models.TimeField(
        null=True,
        blank=True
    )

    event_type = models.CharField(
        max_length=20,
        choices=EVENT_TYPES,
        default="personal"
    )


    created_at = models.DateTimeField(
        auto_now_add=True
    )

    color = models.CharField(
    max_length=20,
    default="#2563eb"
    )


    def __str__(self):
        return self.title