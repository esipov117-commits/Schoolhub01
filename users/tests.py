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
from .views import REMEMBERED_USER_COOKIE, _encode_cookie_username, _get_remembered_user


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


class RegisterTests(TestCase):
    def setUp(self):
        self.payload = {
            'username': 'newuser',
            'password1': 'SuperSecret123!',
            'password2': 'SuperSecret123!',
        }

    def test_register_page_shows_username_field(self):
        response = self.client.get(reverse('register'))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'name="username"')

    def test_register_creates_active_user_and_logs_in(self):
        response = self.client.post(reverse('register'), self.payload)

        self.assertRedirects(response, reverse('home'))
        user = User.objects.get(username='newuser')
        self.assertTrue(user.is_active)
        self.assertTrue(hasattr(user, 'profile'))
        self.assertEqual(str(user.pk), self.client.session['_auth_user_id'])

    def test_register_rejects_duplicate_username(self):
        User.objects.create_user(
            username='newuser', password='x',
        )
        response = self.client.post(reverse('register'), self.payload)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(User.objects.filter(username='newuser').count(), 1)
        self.assertContains(response, 'уже существует')


class RememberedUserCookieTests(TestCase):
    """Куки sh_remembered_user не должны содержать не-ASCII значения,
    иначе gunicorn/nginx отбрасывают запросы (502)."""

    def setUp(self):
        self.user = User.objects.create_user(
            username='Владислав', password='secret123',
        )

    def test_encode_username_is_ascii(self):
        self.assertTrue(any(ord(c) > 127 for c in self.user.username))
        value = _encode_cookie_username(self.user.username)
        self.assertTrue(all(ord(c) < 128 for c in value))

    def test_roundtrip_encoded_cookie(self):
        request = type('Request', (), {
            'COOKIES': {REMEMBERED_USER_COOKIE: _encode_cookie_username(self.user.username)},
        })()
        self.assertEqual(_get_remembered_user(request), self.user)

    def test_legacy_non_ascii_cookie_ignored(self):
        request = type('Request', (), {
            'COOKIES': {REMEMBERED_USER_COOKIE: 'Владислав'},
        })()
        self.assertIsNone(_get_remembered_user(request))

    def test_login_sets_ascii_safe_cookie(self):
        response = self.client.post(
            reverse('login'),
            {'username': 'Владислав', 'password': 'secret123'},
        )
        self.assertRedirects(response, reverse('home'))
        value = response.cookies[REMEMBERED_USER_COOKIE].value
        self.assertTrue(all(ord(c) < 128 for c in value))


class WarningFlagTests(TestCase):
    def setUp(self):
        self.staff = User.objects.create_user('admin', password='pass12345', is_staff=True)
        Profile.objects.create(user=self.staff)
        self.moderator = User.objects.create_user('mod', password='pass12345')
        Profile.objects.create(user=self.moderator, is_moderator=True)
        self.target = User.objects.create_user('target', password='pass12345')
        Profile.objects.create(user=self.target)
        self.plain = User.objects.create_user('plain', password='pass12345')
        Profile.objects.create(user=self.plain)

    def _flag(self, user):
        return Profile.objects.get(user=user).has_warning

    def test_moderator_can_give_warning(self):
        self.client.force_login(self.moderator)
        resp = self.client.post(reverse('toggle_warning', args=[self.target.username]))
        self.assertRedirects(resp, reverse('profile_user', args=[self.target.username]))
        self.assertTrue(self._flag(self.target))

    def test_staff_can_give_warning(self):
        self.client.force_login(self.staff)
        resp = self.client.post(reverse('toggle_warning', args=[self.target.username]))
        self.assertRedirects(resp, reverse('profile_user', args=[self.target.username]))
        self.assertTrue(self._flag(self.target))

    def test_warning_toggles_off(self):
        self.client.force_login(self.moderator)
        self.client.post(reverse('toggle_warning', args=[self.target.username]))
        self.client.post(reverse('toggle_warning', args=[self.target.username]))
        self.assertFalse(self._flag(self.target))

    def test_plain_user_cannot_warn(self):
        self.client.force_login(self.plain)
        resp = self.client.post(reverse('toggle_warning', args=[self.target.username]))
        self.assertRedirects(resp, reverse('home'))
        self.assertFalse(self._flag(self.target))

    def test_cannot_warn_self(self):
        self.client.force_login(self.moderator)
        resp = self.client.post(reverse('toggle_warning', args=[self.moderator.username]))
        self.assertRedirects(resp, reverse('profile_user', args=[self.moderator.username]))
        self.assertFalse(self._flag(self.moderator))

    def test_warned_profile_shows_icon_and_tooltip(self):
        self.client.force_login(self.moderator)
        Profile.objects.filter(user=self.target).update(has_warning=True)
        resp = self.client.get(reverse('profile_user', args=[self.target.username]))
        html = resp.content.decode()
        self.assertIn('warning-icon', html)
        self.assertIn('сквернословит', html)

    def test_admin_profile_has_warn_button(self):
        self.client.force_login(self.moderator)
        resp = self.client.get(reverse('profile_user', args=[self.target.username]))
        html = resp.content.decode()
        self.assertIn(reverse('toggle_warning', args=[self.target.username]), html)
