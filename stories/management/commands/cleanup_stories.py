from django.core.management.base import BaseCommand
from django.utils import timezone
from stories.models import Story


class Command(BaseCommand):
    help = 'Удаляет истёкшие истории'

    def handle(self, *args, **kwargs):
        expired = Story.objects.filter(expires_at__lt=timezone.now())
        count = expired.count()
        for story in expired:
            if story.image:
                story.image.delete(save=False)
            if story.video:
                story.video.delete(save=False)
            story.delete()
        self.stdout.write(f'Удалено {count} истёкших историй')
