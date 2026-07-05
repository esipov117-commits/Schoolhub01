from django.shortcuts import render, redirect
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.decorators import login_required
from .models import Profile
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
    if request.user.is_authenticated:
        Profile.objects.get_or_create(user=request.user)
    recent_posts = Post.objects.all()[:3]
    return render(request, 'users/home.html', {'recent_posts': recent_posts})


@login_required
def profile(request):
    profile_obj, created = Profile.objects.get_or_create(user=request.user)
    user_posts = Post.objects.filter(author=request.user)
    return render(request, 'users/profile.html', {
        'profile': profile_obj,
        'user_posts': user_posts,
    })
