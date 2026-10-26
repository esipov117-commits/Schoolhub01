import uuid
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand
from django.urls import reverse

from chat import crypto
from chat.models import Message
from chat.views import (
    CHAT_FILE_ID_RE,
    INLINE_IMAGE_EXTENSIONS,
    _attachment_mime,
    _attachment_name,
    _chat_file_path,
)


class Command(BaseCommand):
    help = 'Переносит старые вложения чата из MEDIA_ROOT в приватное зашифрованное хранилище.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Только показать изменения.')
        parser.add_argument(
            '--keep-originals',
            action='store_true',
            help='Не удалять исходные незашифрованные файлы после переноса.',
        )

    def _legacy_path(self, url):
        raw = str(url or '').split('?', 1)[0]
        media_url = settings.MEDIA_URL.rstrip('/') + '/'
        if not raw.startswith(media_url):
            return None
        relative = raw[len(media_url) :]
        if not relative.startswith('chat_uploads/'):
            return None
        root = (Path(settings.MEDIA_ROOT) / 'chat_uploads').resolve()
        candidate = (Path(settings.MEDIA_ROOT) / relative).resolve()
        try:
            candidate.relative_to(root)
        except ValueError:
            return None
        return candidate

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        keep_originals = options['keep_originals']
        migrated = 0
        skipped = 0
        missing = 0

        messages = Message.objects.exclude(attachments=[]).order_by('pk')
        for message in messages.iterator():
            attachments = list(message.attachments or [])
            changed = False
            legacy_to_remove = []

            for item in attachments:
                if not isinstance(item, dict):
                    skipped += 1
                    continue

                original_name = _attachment_name(item)
                mime_type, ext = _attachment_mime(original_name)
                if not mime_type:
                    self.stderr.write(
                        self.style.WARNING(f'Сообщение {message.pk}: неизвестный тип файла {original_name!r}, пропуск')
                    )
                    skipped += 1
                    continue

                file_id = str(item.get('file_id') or '')
                legacy = self._legacy_path(item.get('url'))
                if not CHAT_FILE_ID_RE.fullmatch(file_id):
                    stem = Path(str(item.get('url') or '')).stem
                    file_id = stem if CHAT_FILE_ID_RE.fullmatch(stem) else uuid.uuid4().hex

                destination = _chat_file_path(message.chat_id, file_id)
                if destination is None:
                    skipped += 1
                    continue

                if destination.is_file():
                    if legacy and legacy.is_file():
                        legacy_to_remove.append(legacy)
                elif legacy and legacy.is_file():
                    data = legacy.read_bytes()
                    encrypted = crypto.encrypt_file(data)
                    if not dry_run:
                        destination.parent.mkdir(parents=True, exist_ok=True)
                        tmp_path = destination.with_name(destination.name + '.tmp')
                        try:
                            tmp_path.write_bytes(encrypted)
                            tmp_path.replace(destination)
                        except Exception:
                            tmp_path.unlink(missing_ok=True)
                            raise
                    legacy_to_remove.append(legacy)
                    migrated += 1
                else:
                    missing += 1
                    self.stderr.write(self.style.WARNING(f'Сообщение {message.pk}: файл {original_name!r} не найден'))

                item['file_id'] = file_id
                item['url'] = reverse('chat_attachment', args=[message.chat_id, file_id])
                item['original_name'] = original_name
                item['mime_type'] = mime_type
                item['is_image'] = ext in INLINE_IMAGE_EXTENSIONS
                changed = True

            if not changed or dry_run:
                continue

            message.attachments = attachments
            message.save(update_fields=['attachments'])

            if not keep_originals:
                for legacy in dict.fromkeys(legacy_to_remove):
                    try:
                        legacy.unlink(missing_ok=True)
                    except OSError as exc:
                        self.stderr.write(self.style.WARNING(f'Не удалось удалить {legacy}: {exc}'))

        suffix = ' (dry-run)' if dry_run else ''
        self.stdout.write(
            self.style.SUCCESS(f'Зашифровано файлов: {migrated}; пропущено: {skipped}; не найдено: {missing}{suffix}')
        )
