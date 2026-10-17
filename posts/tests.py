import tempfile
from io import BytesIO

from django.conf import settings
from django.test import TestCase, Client, override_settings
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.template.loader import render_to_string
from django.urls import reverse

from .models import Post, PostImage, Comment
from .views import _post_queryset

User = get_user_model()


class CommentReplyTests(TestCase):
    def setUp(self):
        self.author = User.objects.create_user('author', password='pass12345')
        self.user = User.objects.create_user('user', password='pass12345')
        self.post = Post.objects.create(author=self.author, content='hello')
        self.client = Client()
        self.client.force_login(self.user)

    def test_root_comment_has_no_parent(self):
        resp = self.client.post(
            reverse('add_comment', args=[self.post.id]),
            {'text': 'first'},
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIsNone(data['parent_id'])
        self.assertIsNone(data['parent_author'])
        self.assertEqual(data['comments_count'], 1)

    def test_reply_to_root(self):
        root = Comment.objects.create(
            post=self.post, author=self.author, text='root',
        )
        resp = self.client.post(
            reverse('add_comment', args=[self.post.id]),
            {'text': 'reply', 'parent_id': root.id},
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data['parent_id'], root.id)
        self.assertEqual(data['parent_author'], 'author')
        reply = Comment.objects.get(id=data['id'])
        self.assertEqual(reply.parent_id, root.id)
        self.assertEqual(data['comments_count'], 2)

    def test_reply_to_reply_flattens_to_root(self):
        root = Comment.objects.create(
            post=self.post, author=self.author, text='root',
        )
        reply = Comment.objects.create(
            post=self.post, author=self.user, text='reply', parent=root,
        )
        resp = self.client.post(
            reverse('add_comment', args=[self.post.id]),
            {'text': 'reply to reply', 'parent_id': reply.id},
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data['parent_id'], root.id)

    def test_parent_from_other_post_rejected(self):
        other = Post.objects.create(author=self.author, content='other')
        other_comment = Comment.objects.create(
            post=other, author=self.author, text='other',
        )
        resp = self.client.post(
            reverse('add_comment', args=[self.post.id]),
            {'text': 'bad', 'parent_id': other_comment.id},
        )
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(
            Comment.objects.filter(post=self.post, text='bad').exists()
        )

    def test_carousel_media_not_huge_vertically(self):
        css = (settings.BASE_DIR / 'static' / 'css' / 'feed.css').read_text(encoding='utf-8')
        self.assertIn('max-height: 50vh', css)
        self.assertIn('object-fit: cover', css)
        self.assertNotIn('max-height: 75vh', css)

    def test_comments_total_includes_replies(self):
        root = Comment.objects.create(
            post=self.post, author=self.author, text='root',
        )
        Comment.objects.create(
            post=self.post, author=self.user, text='reply', parent=root,
        )
        post = _post_queryset().get(pk=self.post.pk)
        self.assertEqual(post.comments_total, 2)

    def test_deleting_root_cascades_replies(self):
        root = Comment.objects.create(
            post=self.post, author=self.author, text='root',
        )
        Comment.objects.create(
            post=self.post, author=self.user, text='reply', parent=root,
        )
        self.client.force_login(self.author)
        resp = self.client.post(reverse('delete_comment', args=[root.id]))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(Comment.objects.filter(post=self.post).count(), 0)

    def _make_image_file(self, name='test.png', size=(120, 80)):
        from PIL import Image
        buf = BytesIO()
        Image.new('RGB', size, 'red').save(buf, 'PNG')
        buf.seek(0)
        return SimpleUploadedFile(name, buf.read(), content_type='image/png')

    def test_postimage_dimensions_populated(self):
        with tempfile.TemporaryDirectory() as tmp:
            with override_settings(MEDIA_ROOT=tmp):
                pi = PostImage.objects.create(
                    post=self.post, image=self._make_image_file(), media_type='image',
                )
                pi.refresh_from_db()
                self.assertEqual(pi.width, 120)
                self.assertEqual(pi.height, 80)

    def test_card_grid_media_square(self):
        with tempfile.TemporaryDirectory() as tmp:
            with override_settings(MEDIA_ROOT=tmp):
                Post.objects.filter(pk=self.post.pk).update(layout='grid')
                for i in range(2):
                    PostImage.objects.create(
                        post=self.post,
                        image=self._make_image_file('g%d.png' % i),
                        media_type='image',
                        order=i,
                    )
                post = _post_queryset().get(pk=self.post.pk)
                html = render_to_string(
                    'posts/_post_card.html',
                    {'post': post, 'user': self.author, 'liked_post_ids': set()},
                )
                self.assertIn('grid-media', html)
                self.assertNotIn('width="120"', html)
                self.assertNotIn('height="80"', html)

    def test_card_renders_only_first_two_roots(self):
        for i in range(5):
            Comment.objects.create(post=self.post, author=self.author, text=f'c{i}')
        post = _post_queryset().get(pk=self.post.pk)
        html = render_to_string(
            'posts/_post_card.html',
            {'post': post, 'user': self.author, 'liked_post_ids': set()},
        )
        self.assertEqual(post.roots_total, 5)
        self.assertEqual(html.count('class="comment"'), 2)
        self.assertIn('data-roots-total="5"', html)
        self.assertIn('show-more-comments', html)

    def test_load_comments_returns_remaining_roots(self):
        for i in range(5):
            Comment.objects.create(post=self.post, author=self.author, text=f'c{i}')
        self.client.force_login(self.author)
        resp = self.client.get(reverse('load_comments', args=[self.post.id]), {'offset': 2})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data['html']), 2)
        self.assertTrue(data['has_more'])

        resp = self.client.get(reverse('load_comments', args=[self.post.id]), {'offset': 4})
        data = resp.json()
        self.assertEqual(len(data['html']), 1)
        self.assertFalse(data['has_more'])

    def test_extracted_assets_exist(self):
        for rel in ('static/css/base.css', 'static/css/feed.css', 'static/js/base.js'):
            path = settings.BASE_DIR / rel
            self.assertTrue(path.exists(), rel)
            self.assertGreater(path.stat().st_size, 0, rel)

    def test_feed_page_uses_external_assets(self):
        self.client.force_login(self.author)
        resp = self.client.get(reverse('feed'))
        self.assertEqual(resp.status_code, 200)
        html = resp.content.decode()
        self.assertNotIn('<style>', html)
        # Имена файлов хешируются ManifestStaticFilesStorage.
        for asset in ('css/base.', 'css/feed.', 'js/base.', 'js/feed.'):
            self.assertIn(asset, html)
        # Единственный инлайн-скрипт — конфиг FEED_CONFIG.
        self.assertEqual(html.count('<script>'), 1)

    def test_card_template_renders_nested_replies(self):
        root = Comment.objects.create(
            post=self.post, author=self.author, text='root',
        )
        Comment.objects.create(
            post=self.post, author=self.user, text='reply', parent=root,
        )
        post = _post_queryset().get(pk=self.post.pk)
        html = render_to_string(
            'posts/_post_card.html',
            {'post': post, 'user': self.author, 'liked_post_ids': set()},
        )
        self.assertIn('id="replies-%d"' % root.id, html)
        self.assertIn('class="reply-btn"', html)
        self.assertIn('class="comment reply"', html)
        self.assertIn('id="comment-%d"' % root.id, html)
