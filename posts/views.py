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
    return render(request, 'posts/feed.html', {'posts': posts})