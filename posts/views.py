from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from .models import Post


@login_required
def feed(request):
    if request.method == 'POST':
        content = request.POST.get('content')
        if content:
            Post.objects.create(author=request.user, content=content)
        return redirect('feed')

    posts = Post.objects.all()

    # Счётчики для карточки профиля в правой колонке (rightbar в base.html)
    stats = {
        'posts_count': Post.objects.filter(author=request.user).count(),
        'friends_count': 0,
        'groups_count': 0,
    }

    return render(request, 'posts/feed.html', {'posts': posts, 'stats': stats})
@login_required
def toggle_like(request, post_id):
    post = Post.objects.get(id=post_id)

    if request.user in post.likes.all():
        post.likes.remove(request.user)
    else:
        post.likes.add(request.user)

    return redirect('feed')
