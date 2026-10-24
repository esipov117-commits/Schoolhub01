from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.db import IntegrityError
from django.test import TestCase, Client
from django.urls import reverse
from django.utils import timezone

from .models import Story, StoryLike, StoryView

User = get_user_model()


class StoryLikeTests(TestCase):
    def setUp(self):
        self.author = User.objects.create_user('author', password='pass12345')
        self.user = User.objects.create_user('user', password='pass12345')
        self.story = Story.objects.create(author=self.author)
        self.client = Client()
        self.client.force_login(self.user)

    def test_toggle_like_then_unlike(self):
        like_url = reverse('toggle_story_like', args=[self.story.id])

        resp = self.client.post(like_url)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data['liked'])
        self.assertEqual(data['likes_count'], 1)

        resp = self.client.post(like_url)
        data = resp.json()
        self.assertFalse(data['liked'])
        self.assertEqual(data['likes_count'], 0)
        self.assertFalse(StoryLike.objects.filter(story=self.story).exists())

    def test_like_unique_constraint(self):
        StoryLike.objects.create(user=self.user, story=self.story)
        with self.assertRaises(IntegrityError):
            StoryLike.objects.create(user=self.user, story=self.story)

    def test_author_cannot_like_own_story(self):
        self.client.force_login(self.author)
        resp = self.client.post(reverse('toggle_story_like', args=[self.story.id]))
        self.assertEqual(resp.status_code, 403)
        self.assertFalse(StoryLike.objects.filter(story=self.story).exists())

    def test_like_requires_login(self):
        client = Client()
        resp = client.post(reverse('toggle_story_like', args=[self.story.id]))
        self.assertEqual(resp.status_code, 302)

    def test_api_active_stories_includes_likes(self):
        StoryLike.objects.create(user=self.user, story=self.story)
        resp = self.client.get(reverse('api_active_stories'))
        self.assertEqual(resp.status_code, 200)
        item = resp.json()['stories'][0]['items'][0]
        self.assertTrue(item['liked_by_me'])
        self.assertEqual(item['likes_count'], 1)

    def test_api_active_stories_hides_expired(self):
        expired = Story.objects.create(
            author=self.author,
            expires_at=timezone.now() - timezone.timedelta(minutes=1),
        )
        resp = self.client.get(reverse('api_active_stories'))
        self.assertEqual(resp.status_code, 200)
        ids = {
            item['id']
            for group in resp.json()['stories']
            for item in group['items']
        }
        self.assertNotIn(expired.id, ids)
        self.assertIn(self.story.id, ids)


class StoryCleanupTests(TestCase):
    def setUp(self):
        self.author = User.objects.create_user('author', password='pass12345')

    def test_cleanup_deletes_only_expired_stories(self):
        expired = Story.objects.create(
            author=self.author,
            expires_at=timezone.now() - timezone.timedelta(minutes=1),
        )
        active = Story.objects.create(author=self.author)

        call_command('cleanup_stories')

        self.assertFalse(Story.objects.filter(pk=expired.pk).exists())
        self.assertTrue(Story.objects.filter(pk=active.pk).exists())


class StoryStatsTests(TestCase):
    def setUp(self):
        self.author = User.objects.create_user('author', password='pass12345')
        self.user = User.objects.create_user('user', password='pass12345')
        self.viewer = User.objects.create_user('viewer', password='pass12345')
        self.story = Story.objects.create(author=self.author)
        self.client = Client()

    def test_stats_denied_to_non_author(self):
        self.client.force_login(self.user)
        resp = self.client.get(reverse('story_stats', args=[self.story.id]))
        self.assertEqual(resp.status_code, 403)

    def test_stats_requires_login(self):
        resp = Client().get(reverse('story_stats', args=[self.story.id]))
        self.assertEqual(resp.status_code, 302)

    def test_author_sees_likes_and_viewers(self):
        StoryLike.objects.create(user=self.user, story=self.story)
        StoryView.objects.create(story=self.story, user=self.viewer)

        self.client.force_login(self.author)
        resp = self.client.get(reverse('story_stats', args=[self.story.id]))
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data['likes_count'], 1)
        self.assertEqual(len(data['viewers']), 1)
        self.assertEqual(data['viewers'][0]['username'], 'viewer')
        self.assertIn('viewed_at', data['viewers'][0])