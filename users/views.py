from django.shortcuts import render, redirect
from django.contrib.auth.forms import UserCreationForm
from posts.models import Post

def register(request):
    if request.method == 'POST':
        form = UserCreationForm(request.POST)
        if form.is_valid():
            form.save()
            return redirect('login')
    else:
        form = UserCreationForm()
    return render(request, 'users/register.html', {'form': form})

def home(request):
    recent_posts = Post.objects.all()[:3]
    return render(request, 'users/home.html', {'recent_posts': recent_posts})