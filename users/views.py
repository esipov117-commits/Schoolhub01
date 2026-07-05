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


#добавлять аватар

from django.contrib.auth.decorators import login_required
from .models import Profile
from posts.models import Post


@login_required
def edit_profile(request):
    profile_obj, created = Profile.objects.get_or_create(user=request.user)
    
    if request.method == 'POST':
        display_name = request.POST.get('display_name')
        group_name = request.POST.get('group_name')
        avatar = request.FILES.get('avatar')
        
        profile_obj.display_name = display_name
        profile_obj.group_name = group_name
        if avatar:
            profile_obj.avatar = avatar
        profile_obj.save()
        
        return redirect('profile')
    
    return render(request, 'users/edit_profile.html', {'profile': profile_obj})