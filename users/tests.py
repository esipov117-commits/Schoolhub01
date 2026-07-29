from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse

from .models import Profile


class ProfileSectionPagesTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='tester', password='secret123')
        Profile.objects.create(user=self.user)

    def test_wall_page_renders(self):
        self.client.force_login(self.user)
        response = self.client.get(reverse('profile'))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Стена')

    def test_friends_page_renders(self):
        self.client.force_login(self.user)
        response = self.client.get(reverse('profile_friends', args=[self.user.username]))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Друзья')
        self.assertContains(response, 'Пока нет друзей')

    def test_photos_page_renders(self):
        self.client.force_login(self.user)
        response = self.client.get(reverse('profile_photos', args=[self.user.username]))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Фото')
        self.assertContains(response, 'Пока нет фото')
