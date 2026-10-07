from django.contrib.auth.models import User
from django.db import models
from django.utils import timezone

from . import crypto


class UserKey(models.Model):
    """Персональный ключ пользователя, зашифрованный мастер-ключом."""

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='chat_key')
    key_encrypted = models.CharField(max_length=255)

    @classmethod
    def raw_key_for(cls, user):
        obj, _ = cls.objects.get_or_create(
            user=user,
            defaults={'key_encrypted': crypto.wrap_key(crypto.new_user_key())},
        )
        return crypto.unwrap_key(obj.key_encrypted)


class Chat(models.Model):
    participants = models.ManyToManyField(User, related_name='chats')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

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
    created_at = models.DateTimeField(auto_now_add=True)

    @classmethod
    def create_encrypted(cls, chat, sender, text):
        bodies = {
            str(u.pk): crypto.encrypt(UserKey.raw_key_for(u), text)
            for u in chat.participants.all()
        }
        message = cls.objects.create(chat=chat, sender=sender, bodies=bodies)
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
