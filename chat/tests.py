from django.test import TestCase, Client
from django.contrib.auth import get_user_model
from django.urls import reverse

User = get_user_model()


class StartChatTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('starter', password='secret123')
        self.other = User.objects.create_user('target', password='secret123')
        self.client = Client()
        self.client.force_login(self.user)

    def test_empty_username_redirects_to_chat(self):
        resp = self.client.post(reverse('start_chat'), {'username': ''})
        self.assertEqual(resp.status_code, 302)
        self.assertEqual(resp.url, reverse('chat'))

    def test_missing_username_redirects_to_chat(self):
        resp = self.client.post(reverse('start_chat'), {})
        self.assertEqual(resp.status_code, 302)
        self.assertEqual(resp.url, reverse('chat'))

    def test_unknown_username_redirects_to_chat(self):
        resp = self.client.post(reverse('start_chat'), {'username': 'ghost'})
        self.assertEqual(resp.status_code, 302)
        self.assertEqual(resp.url, reverse('chat'))

    def test_start_chat_creates_dialog(self):
        resp = self.client.post(reverse('start_chat'), {'username': 'target'})
        self.assertEqual(resp.status_code, 302)
        self.assertIn('/chat/', resp.url)
