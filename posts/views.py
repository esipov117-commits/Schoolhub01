from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from .models import Post, Like


@login_required
def feed(request):
    if request.method == 'POST':
        content = request.POST.get('content')
        image = request.FILES.get('image')
        if content or image:
            Post.objects.create(author=request.user, content=content, image=image)
        return redirect('feed')

    posts = Post.objects.all()
    liked_post_ids = set(Like.objects.filter(user=request.user).values_list('post_id', flat=True))
    stats = {
        'posts_count': Post.objects.filter(author=request.user).count(),
        'friends_count': 0,
        'groups_count': 0,
    }
    return render(request, 'posts/feed.html', {
        'posts': posts,
        'liked_post_ids': liked_post_ids,
        'stats': stats,
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

    likes_count = post.likes.count()

    return JsonResponse({
        'liked': liked,
        'likes_count': likes_count,
    })


@login_required
def delete_post(request, post_id):
    post = get_object_or_404(Post, id=post_id)
    if post.author == request.user:
        post.delete()
        return JsonResponse({'deleted': True})
    return JsonResponse({'deleted': False, 'error': 'Not your post'}, status=403)