import os
from io import BytesIO

from django.db import models
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from PIL import Image, ImageOps


def downscale_image(field_file, max_dim, quality=82):
    """Уменьшает картинку до max_dim по большей стороне и оптимизирует её.
    Возвращает ContentFile или None, если обрабатывать нечего/нельзя."""
    if not field_file:
        return None

    def reset():
        try:
            field_file.seek(0)
        except Exception:
            pass

    name = getattr(field_file, 'name', '') or ''
    ext = os.path.splitext(name)[1].lower()
    if ext in ('.gif', '.svg'):
        return None

    try:
        field_file.seek(0)
        img = Image.open(field_file)
        img.load()
    except Exception:
        reset()
        return None

    img = ImageOps.exif_transpose(img)

    if max(img.size) <= max_dim and ext in ('.jpg', '.jpeg', '.png', '.webp'):
        reset()
        return None

    fmt = (img.format or '').upper()
    if fmt not in ('JPEG', 'PNG', 'WEBP'):
        fmt = 'JPEG' if ext in ('.jpg', '.jpeg') else 'PNG'

    if max(img.size) > max_dim:
        img.thumbnail((max_dim, max_dim), Image.LANCZOS)

    out = BytesIO()
    if fmt == 'JPEG':
        if img.mode not in ('RGB', 'L'):
            img = img.convert('RGB')
        img.save(out, format='JPEG', quality=quality, optimize=True, progressive=True)
        out_ext = '.jpg'
    elif fmt == 'WEBP':
        img.save(out, format='WEBP', quality=quality, method=6)
        out_ext = '.webp'
    else:
        if img.mode not in ('RGB', 'RGBA', 'L', 'P'):
            img = img.convert('RGB')
        img.save(out, format='PNG', optimize=True)
        out_ext = '.png'

    base = os.path.splitext(os.path.basename(name))[0]
    reset()
    return ContentFile(out.getvalue(), name=base + out_ext)


def validate_image_size(image):
    max_size_mb = 5
    if image.size > max_size_mb * 1024 * 1024:
        raise ValidationError(
            f"Размер файла не должен превышать {max_size_mb}MB"
        )


def validate_video_size(video):
    max_size_mb = 3000
    if video.size > max_size_mb * 1024 * 1024:
        raise ValidationError(
            f"Размер видео не должен превышать {max_size_mb} MB"
        )


class Profile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)

    display_name = models.CharField(max_length=100, blank=True)
    group_name = models.CharField(max_length=50, blank=True)
    status = models.CharField(max_length=100, blank=True)
    bio = models.TextField(max_length=500, blank=True)

    avatar = models.ImageField(
        upload_to="avatars/",
        blank=True,
        null=True,
        validators=[validate_image_size],
    )

    banner = models.ImageField(
        upload_to="banners/",
        blank=True,
        null=True,
        validators=[validate_image_size],
    )

    banner_position = models.PositiveSmallIntegerField(default=50)

    is_verified = models.BooleanField(default=False)
    is_organizer = models.BooleanField(default=False)
    is_donor = models.BooleanField(default=False)

    dark_mode = models.BooleanField(default=False)

    language = models.CharField(
        max_length=10,
        choices=[
            ("ru", "Русский"),
            ("en", "English"),
        ],
        default="ru",
    )

    def __str__(self):
        return self.user.username


class Follow(models.Model):
    follower = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="following",
    )

    following = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="followers",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("follower", "following")

    def __str__(self):
        return f"{self.follower.username} → {self.following.username}"