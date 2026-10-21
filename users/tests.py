import tempfile
from io import BytesIO
from pathlib import Path

from django.conf import settings
from django.contrib.auth.models import User
from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

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


def _activation_url(user):
    uidb64 = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    return reverse('activate', kwargs={'uidb64': uidb64, 'token': token})


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
class EmailRegistrationTests(TestCase):
    def setUp(self):
        self.payload = {
            'username': 'newuser',
            'email': 'newuser@example.com',
            'password1': 'SuperSecret123!',
            'password2': 'SuperSecret123!',
        }

    def test_register_page_shows_email_field(self):
        response = self.client.get(reverse('register'))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'name="email"')
        self.assertContains(response, 'name="username"')

    def test_register_creates_inactive_user_and_sends_email(self):
        response = self.client.post(reverse('register'), self.payload)

        self.assertRedirects(response, reverse('activation_sent'))
        user = User.objects.get(username='newuser')
        self.assertFalse(user.is_active)
        self.assertEqual(user.email, 'newuser@example.com')
        self.assertTrue(hasattr(user, 'profile'))

        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('Подтвердите почту', mail.outbox[0].subject)

    def test_register_rejects_duplicate_email(self):
        User.objects.create_user(
            username='existing', email='newuser@example.com', password='x',
        )
        response = self.client.post(reverse('register'), self.payload)

        self.assertEqual(response.status_code, 200)
        self.assertFalse(User.objects.filter(username='newuser').exists())
        self.assertContains(response, 'уже зарегистрирован')

    def test_register_reuses_unconfirmed_username(self):
        User.objects.create_user(
            username='newuser', email='old@example.com',
            password='SuperSecret123!', is_active=False,
        )
        response = self.client.post(reverse('register'), self.payload)

        self.assertRedirects(response, reverse('activation_sent'))
        self.assertFalse(User.objects.filter(email='old@example.com').exists())
        self.assertEqual(User.objects.filter(username='newuser').count(), 1)

    def test_register_reuses_unconfirmed_email(self):
        User.objects.create_user(
            username='other', email='newuser@example.com',
            password='SuperSecret123!', is_active=False,
        )
        response = self.client.post(reverse('register'), self.payload)

        self.assertRedirects(response, reverse('activation_sent'))
        self.assertFalse(User.objects.filter(username='other').exists())
        self.assertEqual(User.objects.filter(username='newuser').count(), 1)

    def test_register_still_rejects_active_username(self):
        User.objects.create_user(
            username='newuser', email='active@example.com', password='x',
        )
        response = self.client.post(reverse('register'), self.payload)

        self.assertEqual(response.status_code, 200)
        self.assertFalse(User.objects.filter(email='newuser@example.com').exists())

    def test_inactive_user_cannot_login(self):
        User.objects.create_user(
            username='newuser', email='newuser@example.com',
            password='SuperSecret123!', is_active=False,
        )
        self.assertFalse(self.client.login(username='newuser', password='SuperSecret123!'))

    def test_activation_link_activates_and_verifies(self):
        user = User.objects.create_user(
            username='newuser', email='newuser@example.com',
            password='SuperSecret123!', is_active=False,
        )
        Profile.objects.create(user=user)

        response = self.client.get(_activation_url(user))

        self.assertRedirects(response, reverse('home'))
        user.refresh_from_db()
        user.profile.refresh_from_db()
        self.assertTrue(user.is_active)
        self.assertTrue(user.profile.email_verified)
        self.assertIsNotNone(user.profile.email_verified_at)

    def test_activation_invalid_token_rejected(self):
        user = User.objects.create_user(
            username='newuser', email='newuser@example.com',
            password='SuperSecret123!', is_active=False,
        )
        url = reverse('activate', kwargs={'uidb64': 'abc', 'token': 'bad-token'})
        response = self.client.get(url)

        self.assertEqual(response.status_code, 400)
        user.refresh_from_db()
        self.assertFalse(user.is_active)

    def test_legacy_user_verification_flow(self):
        user = User.objects.create_user(
            username='legacy', email='legacy@example.com',
            password='SuperSecret123!', is_active=True,
        )
        Profile.objects.create(user=user)

        self.client.force_login(user)
        response = self.client.get(reverse('home'))
        self.assertContains(response, 'verify-banner')

        response = self.client.get(reverse('verify_email'))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Подтвердите почту')

        self.client.post(
            reverse('verify_email'), {'email': 'legacy@example.com'},
        )
        self.assertEqual(len(mail.outbox), 1)

        self.client.get(_activation_url(user))
        user.profile.refresh_from_db()
        self.assertTrue(user.profile.email_verified)

    def test_verify_email_rejects_taken_address(self):
        User.objects.create_user(
            username='taken', email='taken@example.com', password='x',
        )
        user = User.objects.create_user(
            username='legacy', email='legacy@example.com',
            password='SuperSecret123!', is_active=True,
        )
        Profile.objects.create(user=user)

        self.client.force_login(user)
        response = self.client.post(
            reverse('verify_email'), {'email': 'taken@example.com'},
        )

        self.assertEqual(response.status_code, 200)
        user.refresh_from_db()
        self.assertEqual(user.email, 'legacy@example.com')
