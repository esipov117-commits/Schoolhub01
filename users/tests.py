import tempfile
from io import BytesIO
from pathlib import Path

from django.conf import settings
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse

from posts.models import Post, PostImage

from .models import Profile


def _make_image_file(name='wall.png'):
    from PIL import Image
    buf = BytesIO()
    Image.new('RGB', (80, 60), 'blue').save(buf, 'PNG')
    buf.seek(0)
    return SimpleUploadedFile(name, buf.read(), content_type='image/png')


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

    def test_rightbar_profile_card_links_to_profile(self):
        self.client.force_login(self.user)
        response = self.client.get(reverse('feed'))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'profile-card-link')
        self.assertContains(response, 'href="/profile/"')

    def test_spa_router_present(self):
        self.client.force_login(self.user)
        response = self.client.get(reverse('feed'))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'id="pageScripts"')
        self.assertContains(response, 'js/base.')
        base_js = (settings.BASE_DIR / 'static' / 'js' / 'base.js').read_text(encoding='utf-8')
        self.assertIn('__pageInits', base_js)
        self.assertIn('__loadedScripts', base_js)
        self.assertIn('history.pushState', base_js)
        feed_js = (settings.BASE_DIR / 'static' / 'js' / 'feed.js').read_text(encoding='utf-8')
        self.assertIn('__pageInits', feed_js)

    def test_search_box_input_has_no_inner_border(self):
        css = (settings.BASE_DIR / 'static' / 'css' / 'base.css').read_text(encoding='utf-8')
        self.assertIn('.search-box input[type="text"]', css)
        self.assertIn('box-shadow: none', css)
        self.assertNotIn('.search-box input {', css)

    def test_wall_post_shows_images(self):
        post = Post.objects.create(author=self.user, content='с фото')
        media = PostImage.objects.create(
            post=post, image=_make_image_file(), media_type='image',
        )
        with tempfile.TemporaryDirectory() as tmp:
            with override_settings(MEDIA_ROOT=tmp):
                self.client.force_login(self.user)
                response = self.client.get(reverse('profile'))
                self.assertEqual(response.status_code, 200)
                self.assertContains(response, 'wall-post-media')
                self.assertContains(response, media.image.url)

    def test_profile_about_card_wraps_long_bio(self):
        self.user.profile.bio = 'ОченьДлинноеСловоБезПробелов ' * 20
        self.user.profile.save()
        self.client.force_login(self.user)
        response = self.client.get(reverse('profile'))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'profile-about-card')
        self.assertContains(response, 'overflow-wrap: anywhere')
        self.assertContains(response, 'word-break: break-word')
