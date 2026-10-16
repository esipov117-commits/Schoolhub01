from django.conf import settings
from django.test import TestCase, Client
from django.contrib.auth import get_user_model
from django.template.loader import render_to_string
from django.urls import reverse

from .models import Post, Comment
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
