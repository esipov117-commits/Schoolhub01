from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.urls import reverse

from .models import Chat, Message

User = get_user_model()


class ChatProfileLinkTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('me', password='pass12345')
        self.other = User.objects.create_user('friend', password='pass12345')
        self.chat = Chat.objects.create()
        self.chat.participants.set([self.user, self.other])
        self.client = Client()
        self.client.force_login(self.user)

    def test_chat_list_has_profile_link_per_dialog(self):
        resp = self.client.get(reverse('chat'))
        self.assertEqual(resp.status_code, 200)
        html = resp.content.decode()
        self.assertIn('dialog-profile', html)
        self.assertIn(reverse('profile_user', args=[self.other.username]), html)

    def test_chat_room_header_links_to_profile(self):
        resp = self.client.get(reverse('chat_room', args=[self.chat.pk]))
        self.assertEqual(resp.status_code, 200)
        html = resp.content.decode()
        self.assertIn('chat-head-user', html)
        self.assertIn(reverse('profile_user', args=[self.other.username]), html)

    def test_chat_room_has_no_nested_anchors(self):
        resp = self.client.get(reverse('chat_room', args=[self.chat.pk]))
        html = resp.content.decode()
        # В шапке не должно быть <a> внутри <a>.
        head = html[html.index('<div class="chat-head"') : html.index('<div class="chat-messages"')]
        self.assertEqual(head.count('<a '), 2)  # кнопка назад + ссылка на профиль


class ChatAttachmentSecurityTests(TestCase):
    def setUp(self):
        import tempfile

        from django.test import override_settings

        self.media_tmp = tempfile.TemporaryDirectory()
        self.private_tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.media_tmp.cleanup)
        self.addCleanup(self.private_tmp.cleanup)
        self.settings_override = override_settings(
            MEDIA_ROOT=self.media_tmp.name,
            CHAT_FILE_ROOT=self.private_tmp.name,
        )
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)

        self.user = User.objects.create_user('me', password='pass12345')
        self.other = User.objects.create_user('friend', password='pass12345')
        self.stranger = User.objects.create_user('stranger', password='pass12345')
        self.chat = Chat.objects.create()
        self.chat.participants.set([self.user, self.other])
        self.other_chat = Chat.objects.create()
        self.other_chat.participants.set([self.user, self.stranger])
        self.client = Client()
        self.client.force_login(self.user)

    def upload(self, name='photo.png', content=b'\x89PNG\r\n\x1a\nsecret-image'):
        from django.core.files.uploadedfile import SimpleUploadedFile

        response = self.client.post(
            reverse('chat_upload', args=[self.chat.pk]),
            {'files': SimpleUploadedFile(name, content, content_type='image/png')},
            HTTP_X_REQUESTED_WITH='XMLHttpRequest',
        )
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()['attachments'][0]

    def send(self, attachment):
        import json

        response = self.client.post(
            reverse('send_message', args=[self.chat.pk]),
            {'body': '', 'attachments_json': json.dumps([attachment])},
            HTTP_X_REQUESTED_WITH='XMLHttpRequest',
        )
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()['attachments'][0]

    def test_upload_stores_only_ciphertext_outside_media(self):
        from pathlib import Path

        secret = b'secret-image-bytes-for-encryption-test'
        attachment = self.upload(content=secret)
        encrypted_path = Path(self.private_tmp.name) / str(self.chat.pk) / (attachment['file_id'] + '.enc')
        self.assertTrue(encrypted_path.is_file())
        self.assertNotIn(secret, encrypted_path.read_bytes())
        self.assertEqual(
            attachment['url'],
            reverse('chat_attachment', args=[self.chat.pk, attachment['file_id']]),
        )
        self.assertFalse(list(Path(self.media_tmp.name).rglob('*')))

    def test_participant_gets_decrypted_image(self):
        secret = b'\x89PNG\r\n\x1a\nsecret-image'
        attachment = self.send(self.upload(content=secret))
        response = self.client.get(attachment['url'])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, secret)
        self.assertEqual(response['Content-Type'], 'image/png')
        self.assertIn('inline', response['Content-Disposition'])
        self.assertEqual(response['X-Content-Type-Options'], 'nosniff')
        self.assertIn('private', response['Cache-Control'])

    def test_non_image_is_forced_to_download(self):
        attachment = self.send(self.upload('note.txt', b'<script>alert(1)</script>'))
        response = self.client.get(attachment['url'])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/octet-stream')
        self.assertIn('attachment', response['Content-Disposition'])
        self.assertEqual(response['X-Content-Type-Options'], 'nosniff')

    def test_anonymous_cannot_download(self):
        attachment = self.upload()
        response = Client().get(attachment['url'])
        self.assertEqual(response.status_code, 302)
        self.assertIn('/accounts/login/', response['Location'])

    def test_non_participant_cannot_download(self):
        attachment = self.upload()
        stranger_client = Client()
        stranger_client.force_login(self.stranger)
        self.assertEqual(stranger_client.get(attachment['url']).status_code, 404)

    def test_file_id_cannot_be_reused_in_another_chat(self):
        attachment = self.upload()
        response = self.client.get(reverse('chat_attachment', args=[self.other_chat.pk, attachment['file_id']]))
        self.assertEqual(response.status_code, 404)

    def test_legacy_chat_media_path_is_blocked(self):
        from pathlib import Path

        legacy = Path(self.media_tmp.name) / 'chat_uploads' / str(self.chat.pk) / 'old.png'
        legacy.parent.mkdir(parents=True)
        legacy.write_bytes(b'old-plaintext')
        response = self.client.get(f'/media/chat_uploads/{self.chat.pk}/old.png')
        self.assertEqual(response.status_code, 404)

    def test_other_public_media_still_served(self):
        from pathlib import Path

        banner = Path(self.media_tmp.name) / 'banners' / 'demo.txt'
        banner.parent.mkdir(parents=True)
        banner.write_bytes(b'public')
        response = self.client.get('/media/banners/demo.txt')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(b''.join(response.streaming_content), b'public')

    def test_send_rejects_attachment_from_another_chat(self):
        import json

        attachment = self.upload()
        response = self.client.post(
            reverse('send_message', args=[self.other_chat.pk]),
            {'body': '', 'attachments_json': json.dumps([attachment])},
            HTTP_X_REQUESTED_WITH='XMLHttpRequest',
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Message.objects.filter(chat=self.other_chat).count(), 0)


class ChatFileMigrationTests(TestCase):
    def setUp(self):
        import tempfile

        from django.test import override_settings

        self.media_tmp = tempfile.TemporaryDirectory()
        self.private_tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.media_tmp.cleanup)
        self.addCleanup(self.private_tmp.cleanup)
        self.settings_override = override_settings(
            MEDIA_ROOT=self.media_tmp.name,
            CHAT_FILE_ROOT=self.private_tmp.name,
        )
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)

        self.user = User.objects.create_user('migrate-me', password='pass12345')
        self.other = User.objects.create_user('migrate-other', password='pass12345')
        self.chat = Chat.objects.create()
        self.chat.participants.set([self.user, self.other])

    def test_command_encrypts_legacy_file_and_updates_message(self):
        import json
        from pathlib import Path

        from django.core.management import call_command

        file_id = 'a' * 32
        legacy = Path(self.media_tmp.name) / 'chat_uploads' / str(self.chat.pk) / f'{file_id}.png'
        legacy.parent.mkdir(parents=True)
        legacy.write_bytes(b'legacy-secret')
        message = Message.objects.create(
            chat=self.chat,
            sender=self.user,
            bodies={},
            attachments=[
                {
                    'file_id': file_id,
                    'url': f'/media/chat_uploads/{self.chat.pk}/{file_id}.png',
                    'mime_type': 'image/png',
                    'original_name': 'old.png',
                    'size': 13,
                    'is_image': True,
                }
            ],
        )

        call_command('encrypt_chat_files', verbosity=0)

        message.refresh_from_db()
        encrypted = Path(self.private_tmp.name) / str(self.chat.pk) / f'{file_id}.enc'
        self.assertTrue(encrypted.is_file())
        self.assertFalse(legacy.exists())
        self.assertNotIn(b'legacy-secret', encrypted.read_bytes())
        self.assertEqual(
            message.attachments[0]['url'],
            reverse('chat_attachment', args=[self.chat.pk, file_id]),
        )
        self.assertEqual(
            json.loads(json.dumps(message.attachments))[0]['file_id'],
            file_id,
        )
