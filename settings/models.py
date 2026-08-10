from django.db import models
language = models.CharField(
    max_length=10,
    choices=[
        ("ru", "Русский"),
        ("en", "English"),
    ],
    default="ru",
)

timezone = models.CharField(
    max_length=64,
    default="UTC",
)

theme = models.CharField(
    max_length=10,
    choices=[
        ("light", "Light"),
        ("dark", "Dark"),
        ("system", "System"),
    ],
    default="system",
)