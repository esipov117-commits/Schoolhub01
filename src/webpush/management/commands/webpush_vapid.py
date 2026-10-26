import base64

from cryptography.hazmat.primitives import serialization
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Генерирует пару VAPID-ключей для Web Push и печатает строки для .env'

    def handle(self, *args, **options):
        from py_vapid import Vapid

        vapid = Vapid()
        vapid.generate_keys()

        raw_private = vapid.private_key.private_numbers().private_value
        private = raw_private.to_bytes(32, 'big')
        public = vapid.public_key.public_bytes(
            serialization.Encoding.X962,
            serialization.PublicFormat.UncompressedPoint,
        )

        def b64url(value):
            return base64.urlsafe_b64encode(value).rstrip(b'=').decode()

        self.stdout.write('Добавьте в .env (и не коммитьте приватный ключ):')
        self.stdout.write('')
        self.stdout.write(f'VAPID_PUBLIC_KEY={b64url(public)}')
        self.stdout.write(f'VAPID_PRIVATE_KEY={b64url(private)}')
        self.stdout.write('VAPID_ADMIN_EMAIL=mailto:admin@example.com')
