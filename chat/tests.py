from django.contrib.auth import get_user_model
from django.test import TestCase, Client
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
        head = html[html.index('<div class="chat-head"'):html.index('<div class="chat-messages"')]
        self.assertEqual(head.count('<a '), 2)  # кнопка назад + ссылка на профиль