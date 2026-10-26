import tempfile
from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.db import IntegrityError
from django.test import Client, TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from PIL import Image

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
        ids = {item['id'] for group in resp.json()['stories'] for item in group['items']}
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


class StoryUploadLayoutTests(TestCase):
    def setUp(self):
        self.author = User.objects.create_user('author', password='pass12345')
        self.client = Client()
        self.client.force_login(self.author)

    def _make_image_file(self, name='story.png', size=(160, 90)):
        buf = BytesIO()
        Image.new('RGB', size, 'red').save(buf, 'PNG')
        buf.seek(0)
        return SimpleUploadedFile(name, buf.read(), content_type='image/png')

    def _upload(self, **data):
        payload = {'media': self._make_image_file()}
        payload.update(data)
        return self.client.post(
            reverse('upload_story'),
            payload,
            HTTP_X_REQUESTED_WITH='XMLHttpRequest',
        )

    def test_upload_stores_layout_settings(self):
        with tempfile.TemporaryDirectory() as tmp, override_settings(MEDIA_ROOT=tmp):
            resp = self._upload(
                fit_mode='cover',
                background_mode='black',
                focus_x='12',
                focus_y='88',
                zoom='140',
                caption='Привет',
            )
            self.assertEqual(resp.status_code, 200)
            story = Story.objects.get(pk=resp.json()['id'])
            self.assertEqual(story.fit_mode, Story.FIT_COVER)
            self.assertEqual(story.background_mode, Story.BACKGROUND_BLACK)
            self.assertEqual(story.focus_x, 12)
            self.assertEqual(story.focus_y, 88)
            self.assertEqual(story.zoom, 140)
            self.assertEqual(story.caption, 'Привет')

    def test_upload_uses_safe_defaults(self):
        with tempfile.TemporaryDirectory() as tmp, override_settings(MEDIA_ROOT=tmp):
            resp = self._upload()
            self.assertEqual(resp.status_code, 200)
            story = Story.objects.get(pk=resp.json()['id'])
            self.assertEqual(story.fit_mode, Story.FIT_CONTAIN)
            self.assertEqual(story.background_mode, Story.BACKGROUND_BLUR)
            self.assertEqual(story.focus_x, 50)
            self.assertEqual(story.focus_y, 50)
            self.assertEqual(story.zoom, 100)

    def test_upload_clamps_invalid_layout_values(self):
        with tempfile.TemporaryDirectory() as tmp, override_settings(MEDIA_ROOT=tmp):
            resp = self._upload(
                fit_mode='stretch',
                background_mode='pink',
                focus_x='-10',
                focus_y='999',
                zoom='999',
            )
            self.assertEqual(resp.status_code, 200)
            story = Story.objects.get(pk=resp.json()['id'])
            self.assertEqual(story.fit_mode, Story.FIT_CONTAIN)
            self.assertEqual(story.background_mode, Story.BACKGROUND_BLUR)
            self.assertEqual(story.focus_x, 0)
            self.assertEqual(story.focus_y, 100)
            self.assertEqual(story.zoom, 250)

    def test_api_returns_layout_settings(self):
        story = Story.objects.create(
            author=self.author,
            media_type=Story.MEDIA_PHOTO,
            fit_mode=Story.FIT_COVER,
            background_mode=Story.BACKGROUND_BLACK,
            focus_x=20,
            focus_y=80,
            zoom=150,
        )
        resp = self.client.get(reverse('api_active_stories'))
        self.assertEqual(resp.status_code, 200)
        item = resp.json()['stories'][0]['items'][0]
        self.assertEqual(item['id'], story.id)
        self.assertEqual(item['fit_mode'], Story.FIT_COVER)
        self.assertEqual(item['background_mode'], Story.BACKGROUND_BLACK)
        self.assertEqual(item['focus_x'], 20)
        self.assertEqual(item['focus_y'], 80)
        self.assertEqual(item['zoom'], 150)

    def test_feed_contains_story_layout_controls(self):
        resp = self.client.get(reverse('feed'))
        self.assertEqual(resp.status_code, 200)
        html = resp.content.decode()
        for element_id in (
            'storyPreviewFrame',
            'storyFitModes',
            'storyBackgroundModes',
            'storyZoomRange',
            'storyResetFrame',
            'storyCaption',
        ):
            self.assertIn(f'id="{element_id}"', html)
