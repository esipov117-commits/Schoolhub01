from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
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
    liked_post_ids = Like.objects.filter(user=request.user).values_list('post_id', flat=True)
    return render(request, 'posts/feed.html', {
        'posts': posts,
        'liked_post_ids': liked_post_ids,
    })
    
@login_required
def toggle_like(request, post_id):
    post = get_object_or_404(Post, id=post_id)
    like, created = Like.objects.get_or_create(user=request.user, post=post)
    if not created:
        like.delete()
    return redirect('feed')