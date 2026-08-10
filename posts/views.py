import os
from django.core.paginator import Paginator
from django.template.loader import render_to_string
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from .models import Post, PostImage, Like, Comment

VIDEO_EXTENSIONS = {'.mp4', '.mov', '.webm', '.avi', '.mkv'}
POSTS_PER_PAGE = 10


@login_required
def feed(request):
    if request.method == 'POST':
        content = request.POST.get('content', '').strip()
        files = request.FILES.getlist('images')
        layout = request.POST.get('layout', 'carousel')
        if layout not in ('carousel', 'grid'):
            layout = 'carousel'

        if content or files:
            post = Post.objects.create(author=request.user, content=content, layout=layout)
            for i, f in enumerate(files):
                ext = os.path.splitext(f.name)[1].lower()
                if ext in VIDEO_EXTENSIONS:
                    PostImage.objects.create(post=post, video=f, media_type='video', order=i)
                else:
                    PostImage.objects.create(post=post, image=f, media_type='image', order=i)

            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                media_items = [
                    {'url': pi.url, 'type': pi.media_type}
                    for pi in post.images.all()
                ]
                return JsonResponse({
                    'id': post.id,
                    'author': post.author.username,
                    'author_avatar': post.author.profile.avatar.url if post.author.profile.avatar else None,
                    'content': post.content,
                    'media_items': media_items,
                    'layout': post.layout,
                    'created_at': post.created_at.strftime('%d.%m.%Y, %H:%M'),
                })
        return redirect('feed')
    liked_post_ids = set(Like.objects.filter(user=request.user).values_list('post_id', flat=True))
 
    # AJAX-запрос на подгрузку следующей страницы (infinite scroll)
    if request.headers.get('X-Requested-With') == 'XMLHttpRequest' and request.GET.get('page'):
        page_number = request.GET.get('page')
        paginator = Paginator(Post.objects.all(), POSTS_PER_PAGE)
        page_obj = paginator.get_page(page_number)
 
        html_list = [
            render_to_string('posts/_post_card.html', {
                'post': p,
                'liked_post_ids': liked_post_ids,
                'user': request.user,
            }, request=request)
            for p in page_obj
        ]
        return JsonResponse({'html': html_list, 'has_next': page_obj.has_next()})
 
    # Обычный первый рендер страницы
    paginator = Paginator(Post.objects.all(), POSTS_PER_PAGE)
    page_obj = paginator.get_page(1)
 
    stats = {
        'posts_count': Post.objects.filter(author=request.user).count(),
        'friends_count': 0,
        'groups_count': 0,
    }
    return render(request, 'posts/feed.html', {
        'posts': page_obj.object_list,
        'liked_post_ids': liked_post_ids,
        'stats': stats,
        'has_next': page_obj.has_next(),
    })
 

@login_required
def toggle_like(request, post_id):
    post = get_object_or_404(Post, id=post_id)
    like, created = Like.objects.get_or_create(user=request.user, post=post)
    if not created:
        like.delete()
        liked = False
    else:
        liked = True

    return JsonResponse({
        'liked': liked,
        'likes_count': post.likes.count(),
    })


@login_required
def delete_post(request, post_id):
    post = get_object_or_404(Post, id=post_id)
    if post.author == request.user:
        post.delete()
        return JsonResponse({'deleted': True})
    return JsonResponse({'deleted': False, 'error': 'Not your post'}, status=403)


@login_required
def add_comment(request, post_id):
    post = get_object_or_404(Post, id=post_id)
    text = request.POST.get('text', '').strip()

    if not text:
        return JsonResponse({'error': 'Комментарий не может быть пустым'}, status=400)

    comment = Comment.objects.create(post=post, author=request.user, text=text)

    return JsonResponse({
        'id': comment.id,
        'author': comment.author.username,
        'author_avatar': comment.author.profile.avatar.url if comment.author.profile.avatar else None,
        'text': comment.text,
        'comments_count': post.comments.count(),
    })


@login_required
def delete_comment(request, comment_id):
    comment = get_object_or_404(Comment, id=comment_id)
    post_id = comment.post_id

    if comment.author != request.user and comment.post.author != request.user:
        return JsonResponse({'deleted': False, 'error': 'Not allowed'}, status=403)

    comment.delete()
    post = Post.objects.get(id=post_id)
    return JsonResponse({'deleted': True, 'comments_count': post.comments.count()})