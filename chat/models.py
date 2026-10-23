from django.contrib.auth.models import User
from django.contrib.postgres.indexes import GinIndex
from django.db import models, transaction
from django.utils import timezone

from . import crypto


class UserKey(models.Model):
    """Персональный ключ пользователя, зашифрованный мастер-ключом."""

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='chat_key')
    key_encrypted = models.CharField(max_length=255)

    @classmethod
    def raw_key_for(cls, user):
        # Кэшируем расшифрованный ключ на объекте пользователя в рамках запроса,
        # иначе каждое сообщение при расшифровке делает отдельный запрос к БД.
        cached = getattr(user, '_chat_raw_key', None)
        if cached is not None:
            return cached

        obj, _ = cls.objects.get_or_create(
            user=user,
            defaults={'key_encrypted': crypto.wrap_key(crypto.new_user_key())},
        )
        key = crypto.unwrap_key(obj.key_encrypted)
        try:
            user._chat_raw_key = key
        except AttributeError:
            pass
        return key


class Chat(models.Model):
    participants = models.ManyToManyField(User, related_name='chats')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['-updated_at']),
        ]

    def interlocutor(self, user):
        return self.participants.exclude(pk=user.pk).first()

    def unread_count_for(self, user):
        return self.messages.exclude(sender=user).exclude(
            read_by__contains=[str(user.pk)]
        ).count()


class Message(models.Model):
    chat = models.ForeignKey(Chat, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sent_messages')
    # {"<user_id>": "<шифротекст>"} — отдельная копия текста для каждого участника
    bodies = models.JSONField()
    read_by = models.JSONField(default=list)
    # [{"file_id", "url", "mime_type", "original_name", "size", "is_image"}]
    attachments = models.JSONField(default=list, blank=True)
    # {"<emoji>": ["<user_id>", ...]}
    reactions = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['chat', '-created_at']),
            GinIndex(fields=['read_by']),
        ]

    @classmethod
    def create_encrypted(cls, chat, sender, text, attachments_data=None):
        bodies = {
            str(u.pk): crypto.encrypt(UserKey.raw_key_for(u), text)
            for u in chat.participants.all()
        }
        message = cls.objects.create(
            chat=chat,
            sender=sender,
            bodies=bodies,
            attachments=attachments_data or [],
        )
        Chat.objects.filter(pk=chat.pk).update(updated_at=timezone.now())
        return message

    def text_for(self, user):
        token = self.bodies.get(str(user.pk))
        if not token:
            return ''
        try:
            return crypto.decrypt(UserKey.raw_key_for(user), token)
        except Exception:
            return '[не удалось расшифровать]'

    def mark_read_by(self, user):
        if self.sender_id == user.pk or str(user.pk) in self.read_by:
            return
        self.read_by.append(str(user.pk))
        self.save(update_fields=['read_by'])

    def toggle_reaction(self, user, emoji):
        """Атомарно добавляет/убирает реакцию пользователя и возвращает словарь."""
        emoji = (emoji or '').strip()[:16]
        if not emoji:
            return self.reactions or {}

        uid = str(user.pk)
        with transaction.atomic():
            message = type(self).objects.select_for_update().get(pk=self.pk)
            reactions = dict(message.reactions or {})
            users = [str(item) for item in reactions.get(emoji, [])]
            if uid in users:
                users.remove(uid)
            else:
                users.append(uid)

            if users:
                reactions[emoji] = users
            else:
                reactions.pop(emoji, None)

            message.reactions = reactions
            message.save(update_fields=['reactions'])
            self.reactions = reactions
        return reactions

