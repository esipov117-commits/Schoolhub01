import json
import os

from django.contrib.auth.decorators import login_required
from django.core.exceptions import ValidationError
from django.core.paginator import Paginator
from django.db.models import Count, IntegerField, OuterRef, Prefetch, Subquery
from django.db.models.functions import Coalesce
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.template.loader import render_to_string
from django.utils import timezone
from django.utils.translation import gettext as _
from django.views.decorators.http import require_POST

from stories.models import Story, StoryView
from users.models import downscale_image

from .models import Comment, Like, Post, PostImage, PostView

VIDEO_EXTENSIONS = {'.mp4', '.mov', '.webm', '.avi', '.mkv'}
POSTS_PER_PAGE = 10
COMMENTS_PER_BATCH = 2
POST_VIEWS_MAX_BATCH = 50


def _post_queryset():
    """Лента постов с готовыми счётчиками лайков/комментариев.

    Раньше здесь было два Count(..., distinct=True) по двум разным связям —
    это порождает декартово произведение (лайки × комментарии) и на постах
    с активностью запрос начинал «подвисать». Считаем счётчики отдельными
    подзапросами: одна строка на пост, без размножения JOIN'ов.
    """
    likes_sq = Like.objects.filter(post=OuterRef('pk')).order_by().values('post').annotate(c=Count('pk')).values('c')
    comments_sq = (
        Comment.objects.filter(post=OuterRef('pk')).order_by().values('post').annotate(c=Count('pk')).values('c')
    )
    roots_sq = (
        Comment.objects.filter(post=OuterRef('pk'), parent__isnull=True)
        .order_by()
        .values('post')
        .annotate(c=Count('pk'))
        .values('c')
    )
    views_sq = (
        PostView.objects.filter(post=OuterRef('pk')).order_by().values('post').annotate(c=Count('pk')).values('c')
    )
    return (
        Post.objects.select_related('author__profile')
        .prefetch_related(
            'images',
            Prefetch(
                'comments',
                queryset=(
                    Comment.objects.filter(parent__isnull=True)
                    .select_related('author__profile')
                    .prefetch_related('replies__author__profile')
                    .order_by('created_at')
                ),
                to_attr='roots',
            ),
        )
        .annotate(
            likes_count=Coalesce(Subquery(likes_sq, output_field=IntegerField()), 0),
            comments_total=Coalesce(Subquery(comments_sq, output_field=IntegerField()), 0),
            roots_total=Coalesce(Subquery(roots_sq, output_field=IntegerField()), 0),
            views_count=Coalesce(Subquery(views_sq, output_field=IntegerField()), 0),
        )
        .order_by('-created_at')
    )


@login_required
def feed(request):
    if request.method == 'POST':
        content = request.POST.get('content', '').strip()
        files = request.FILES.getlist('images')
        layout = request.POST.get('layout', 'carousel')
        if layout not in ('carousel', 'grid'):
            layout = 'carousel'

        is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'

        if content or files:
            post = Post.objects.create(author=request.user, content=content, layout=layout)
            try:
                for i, f in enumerate(files):
                    ext = os.path.splitext(f.name)[1].lower()
                    if ext in VIDEO_EXTENSIONS:
                        media = PostImage(post=post, video=f, media_type='video', order=i)
                    else:
                        processed = downscale_image(f, 1600)
                        media = PostImage(post=post, image=processed or f, media_type='image', order=i)
                    media.full_clean()
                    media.save()
            except ValidationError as e:
                post.delete()
                if is_ajax:
                    return JsonResponse({'error': '; '.join(e.messages)}, status=400)
                return redirect('feed')

            if is_ajax:
                media_items = [{'url': pi.url, 'type': pi.media_type} for pi in post.images.all()]
                author_profile = getattr(post.author, 'profile', None)
                return JsonResponse(
                    {
                        'id': post.id,
                        'author': post.author.username,
                        'author_avatar': author_profile.avatar.url
                        if author_profile and author_profile.avatar
                        else None,
                        'content': post.content,
                        'media_items': media_items,
                        'layout': post.layout,
                        'created_at': post.created_at.isoformat(),
                    }
                )
        elif is_ajax:
            return JsonResponse({'error': _('Добавьте текст или выберите фото')}, status=400)
        return redirect('feed')
    liked_post_ids = set(Like.objects.filter(user=request.user).values_list('post_id', flat=True))
    posts_qs = _post_queryset()

    # AJAX-запрос на подгрузку следующей страницы (infinite scroll)
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest' and request.GET.get('page'):
        page_number = request.GET.get('page')
        paginator = Paginator(posts_qs, POSTS_PER_PAGE)
        page_obj = paginator.get_page(page_number)

        html_list = [
            render_to_string(
                'posts/_post_card.html',
                {
                    'post': p,
                    'liked_post_ids': liked_post_ids,
                    'user': request.user,
                },
                request=request,
            )
            for p in page_obj
        ]
        return JsonResponse({'html': html_list, 'has_next': page_obj.has_next()})

    # Обычный первый рендер страницы
    paginator = Paginator(posts_qs, POSTS_PER_PAGE)
    page_obj = paginator.get_page(1)

    # Активные истории, сгруппированные по автору (для ленты в stories)
    cutoff = timezone.now() - timezone.timedelta(hours=24)
    grouped = {}
    for story in (
        Story.objects.filter(created_at__gte=cutoff).select_related('author__profile').order_by('author', '-created_at')
    ):
        grouped.setdefault(story.author, []).append(story)
    grouped.pop(request.user, None)

    viewed_story_ids = set(
        StoryView.objects.filter(user=request.user, story__created_at__gte=cutoff).values_list('story_id', flat=True)
    )
    other_stories = [
        (author, author_stories, all(s.id in viewed_story_ids for s in author_stories))
        for author, author_stories in grouped.items()
    ]

    stats = {
        'posts_count': Post.objects.filter(author=request.user).count(),
        'friends_count': 0,
        'groups_count': 0,
    }
    return render(
        request,
        'posts/feed.html',
        {
            'posts': page_obj.object_list,
            'liked_post_ids': liked_post_ids,
            'stats': stats,
            'has_next': page_obj.has_next(),
            'other_stories': other_stories,
        },
    )


@login_required
def community(request):
    from django.contrib.auth.models import User

    from users.models import Follow

    users = User.objects.select_related('profile').order_by('username')
    following_ids = set(Follow.objects.filter(follower=request.user).values_list('following_id', flat=True))
    # detect mutual follows
    my_following = set(Follow.objects.filter(follower=request.user).values_list('following_id', flat=True))
    followers_me = set(Follow.objects.filter(following=request.user).values_list('follower_id', flat=True))
    friend_ids = my_following & followers_me
    return render(
        request,
        'posts/community.html',
        {
            'users': users,
            'following_ids': following_ids,
            'friend_ids': friend_ids,
        },
    )


@login_required
def toggle_like(request, post_id):
    post = get_object_or_404(Post, id=post_id)
    like, created = Like.objects.get_or_create(user=request.user, post=post)
    if not created:
        like.delete()
        liked = False
    else:
        liked = True

    return JsonResponse(
        {
            'liked': liked,
            'likes_count': post.likes.count(),
        }
    )


@login_required
def post_likes(request, post_id):
    """Список лайкнувших пост — доступен только автору поста."""
    post = get_object_or_404(Post, id=post_id)
    if post.author_id != request.user.id:
        return JsonResponse({'error': _('Список доступен только автору поста')}, status=403)

    likes = Like.objects.filter(post=post).select_related('user__profile').order_by('-created_at')
    likers = []
    for like in likes:
        profile = getattr(like.user, 'profile', None)
        likers.append(
            {
                'username': like.user.username,
                'avatar': profile.avatar.url if profile and profile.avatar else None,
                'liked_at': like.created_at.isoformat(),
            }
        )

    return JsonResponse(
        {
            'likes_count': post.likes.count(),
            'likers': likers,
        }
    )


@login_required
@require_POST
def mark_post_viewed(request):
    """Пакетно отмечает посты просмотренными для текущего пользователя.

    Один просмотр на пользователя (unique post+user), свои посты не считаем.
    """
    try:
        payload = json.loads(request.body.decode('utf-8') or '{}')
    except (ValueError, TypeError):
        payload = {}

    raw_ids = payload.get('post_ids') or request.POST.getlist('post_ids')
    if not raw_ids:
        return JsonResponse({'ok': True, 'views_created': 0, 'created_ids': []})
    if not isinstance(raw_ids, (list, tuple)):
        raw_ids = [raw_ids]
    if len(raw_ids) > POST_VIEWS_MAX_BATCH:
        return JsonResponse({'error': _('Слишком много постов')}, status=400)

    try:
        post_ids = {int(pid) for pid in raw_ids}
    except (TypeError, ValueError):
        return JsonResponse({'error': _('Некорректный запрос')}, status=400)

    existing = set(PostView.objects.filter(user=request.user, post_id__in=post_ids).values_list('post_id', flat=True))
    to_create = post_ids - existing
    if not to_create:
        return JsonResponse({'ok': True, 'views_created': 0, 'created_ids': []})

    eligible = set(Post.objects.filter(pk__in=to_create).exclude(author=request.user).values_list('pk', flat=True))
    PostView.objects.bulk_create(
        [PostView(user=request.user, post_id=pid) for pid in eligible],
        ignore_conflicts=True,
    )
    created_ids = sorted(eligible)
    return JsonResponse(
        {
            'ok': True,
            'views_created': len(created_ids),
            'created_ids': created_ids,
        }
    )


@login_required
def delete_post(request, post_id):
    post = get_object_or_404(Post, id=post_id)
    is_moderator = request.user.profile.is_moderator or request.user.is_staff
    if post.author == request.user or is_moderator:
        post.delete()
        return JsonResponse({'deleted': True})
    return JsonResponse({'deleted': False, 'error': 'Not your post'}, status=403)


@login_required
def edit_post(request, post_id):
    post = get_object_or_404(Post, id=post_id)
    if post.author != request.user:
        return JsonResponse({'ok': False, 'error': 'Not your post'}, status=403)
    if request.method != 'POST':
        return JsonResponse({'ok': False, 'error': 'POST required'}, status=405)

    content = request.POST.get('content', '').strip()
    post.content = content
    post.edited_at = timezone.now()
    post.save(update_fields=['content', 'edited_at'])
    return JsonResponse({'ok': True, 'content': post.content})


@login_required
def add_comment(request, post_id):
    post = get_object_or_404(Post, id=post_id)
    text = request.POST.get('text', '').strip()

    if not text:
        return JsonResponse({'error': _('Комментарий не может быть пустым')}, status=400)

    parent = None
    parent_id = request.POST.get('parent_id', '').strip()
    if parent_id:
        try:
            parent = Comment.objects.get(id=parent_id)
        except (Comment.DoesNotExist, ValueError):
            return JsonResponse({'error': _('Комментарий не найден')}, status=400)
        if parent.post_id != post.id:
            return JsonResponse({'error': _('Комментарий не найден')}, status=400)
        # Одноуровневая вложенность: ответ на ответ прикрепляем к корневому.
        if parent.parent_id:
            parent = parent.parent

    comment = Comment.objects.create(post=post, author=request.user, text=text, parent=parent)

    author_profile = getattr(comment.author, 'profile', None)
    return JsonResponse(
        {
            'id': comment.id,
            'author': comment.author.username,
            'author_avatar': author_profile.avatar.url if author_profile and author_profile.avatar else None,
            'text': comment.text,
            'parent_id': comment.parent_id,
            'parent_author': comment.parent.author.username if comment.parent_id else None,
            'comments_count': post.comments.count(),
        }
    )


@login_required
def load_comments(request, post_id):
    post = get_object_or_404(Post, id=post_id)
    try:
        offset = int(request.GET.get('offset', 0))
    except (TypeError, ValueError):
        offset = 0
    if offset < 0:
        offset = 0

    roots = (
        Comment.objects.filter(post=post, parent__isnull=True)
        .select_related('author__profile')
        .prefetch_related('replies__author__profile')
        .order_by('created_at')
    )
    batch = list(roots[offset : offset + COMMENTS_PER_BATCH])
    html_list = [
        render_to_string(
            'posts/_comment.html',
            {'comment': c, 'post': post, 'user': request.user},
            request=request,
        )
        for c in batch
    ]
    return JsonResponse(
        {
            'html': html_list,
            'has_more': offset + len(batch) < roots.count(),
        }
    )


@login_required
def delete_comment(request, comment_id):
    comment = get_object_or_404(Comment, id=comment_id)
    post_id = comment.post_id

    profile = getattr(request.user, 'profile', None)
    is_moderator = bool(profile and profile.is_moderator) or request.user.is_staff
    if comment.author != request.user and comment.post.author != request.user and not is_moderator:
        return JsonResponse({'deleted': False, 'error': 'Not allowed'}, status=403)

    comment.delete()
    post = Post.objects.get(id=post_id)
    return JsonResponse({'deleted': True, 'comments_count': post.comments.count()})
