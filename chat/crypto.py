"""Обёрточное (envelope) шифрование для чата.

Схема из трёх уровней:
1. Мастер-ключ (из настроек) шифрует персональный ключ каждого пользователя.
2. Персональный ключ пользователя шифрует копии сообщений.
3. В БД лежат только шифротексты: без мастер-ключа из .env сообщения не читать.
"""

import base64
import hashlib
import os

from cryptography.fernet import Fernet
from django.conf import settings

_master_fernet = None


def _master() -> Fernet:
    global _master_fernet
    if _master_fernet is None:
        raw = settings.CHAT_MASTER_KEY
        if raw:
            key = raw.encode()
        else:
            digest = hashlib.sha256(("schoolhub-chat|" + settings.SECRET_KEY).encode()).digest()
            key = base64.urlsafe_b64encode(digest)
        _master_fernet = Fernet(key)
    return _master_fernet


def new_user_key() -> str:
    """Случайный персональный ключ пользователя (32 байта в base64)."""
    return base64.urlsafe_b64encode(os.urandom(32)).decode()


def wrap_key(raw_key: str) -> str:
    """Шифрует персональный ключ мастер-ключом (для хранения в БД)."""
    return _master().encrypt(raw_key.encode()).decode()


def unwrap_key(token: str) -> str:
    """Расшифровывает персональный ключ мастер-ключом."""
    return _master().decrypt(token.encode()).decode()


def encrypt(raw_key: str, plaintext: str) -> str:
    """Шифрует текст персональным ключом пользователя."""
    return Fernet(raw_key.encode()).encrypt(plaintext.encode()).decode()


def decrypt(raw_key: str, token: str) -> str:
    """Расшифровывает текст персональным ключом пользователя."""
    return Fernet(raw_key.encode()).decrypt(token.encode()).decode()
