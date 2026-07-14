from django.shortcuts import render, redirect
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404
from django.contrib.auth.models import User
from .models import Profile, Follow
from posts.models import Post
from events.models import Event
from django.utils import timezone


def register(request):
    if request.method == 'POST':
        form = UserCreationForm(request.POST, request.FILES)
        if form.is_valid():
            user = form.save()
            Profile.objects.create(user=user)  # создаём профиль сразу
            return redirect('login')
    else:
        form = UserCreationForm()

    return render(request, 'users/register.html', {'form': form})


def home(request):
    if not request.user.is_authenticated:
        return render(request, 'welcome.html')

    Profile.objects.get_or_create(user=request.user)
    recent_posts = Post.objects.all()[:3]
    upcoming_events = Event.objects.filter(date__gte=timezone.now()).order_by('date')[:3]

    # Счётчики для карточки профиля в правой колонке (rightbar в base.html)
    stats = {
        'posts_count': Post.objects.filter(author=request.user).count(),
        'friends_count': 0,   # пока нет системы друзей
        'groups_count': 0,    # пока нет групп
    }

    return render(request, 'users/home.html', {
        'recent_posts': recent_posts,
        'upcoming_events': upcoming_events,
        'stats': stats,
    })


# Было два одинаковых def profile(request) — вторая версия (ниже, с username)
# полностью перекрывала первую, так что первая никогда не вызывалась.
# Оставляем только рабочую версию и добавляем недостающие posts_count/friends_count.
@login_required
def profile(request, username=None):
    if username:
        target_user = get_object_or_404(User, username=username)
    else:
        target_user = request.user
    profile_obj, _ = Profile.objects.get_or_create(user=target_user)
    user_posts = Post.objects.filter(author=target_user)
    is_own_profile = (target_user == request.user)
    posts_count = user_posts.count()
    followers_count = target_user.followers.count()
    following_count = target_user.following.count()
    is_following = Follow.objects.filter(follower=request.user, following=target_user).exists()
    return render(request, 'users/profile.html', {
        'profile': profile_obj,
        'user_posts': user_posts,
        'profile_user': target_user,
        'is_own_profile': is_own_profile,
        'posts_count': posts_count,
        'followers_count': followers_count,
        'following_count': following_count,
        'is_following': is_following,
    })


@login_required
def edit_profile(request):
    profile_obj, created = Profile.objects.get_or_create(user=request.user)

    if request.method == 'POST':
        profile_obj.display_name = request.POST.get('display_name')
        profile_obj.group_name = request.POST.get('group_name')

        avatar = request.FILES.get('avatar')
        if avatar:
            profile_obj.avatar = avatar

        banner = request.FILES.get('banner')
        if banner:
            profile_obj.banner = banner
        profile_obj.banner_position = request.POST.get('banner_position', profile_obj.banner_position or 50)

        profile_obj.save()
        return redirect('profile')

    return render(request, 'users/edit_profile.html', {'profile': profile_obj})


@login_required
def toggle_theme(request):
    profile_obj, _ = Profile.objects.get_or_create(user=request.user)
    profile_obj.dark_mode = not profile_obj.dark_mode
    profile_obj.save()
    return redirect(request.META.get('HTTP_REFERER', 'home'))

@login_required
def toggle_follow(request, username):
    target_user = get_object_or_404(User, username=username)
    if target_user != request.user:
        follow, created = Follow.objects.get_or_create(follower=request.user, following=target_user)
        if not created:
            follow.delete()
    return redirect('profile_user', username=username)

@login_required
def search_users(request):
    query = request.GET.get('q', '').strip()
    if query:
        results = User.objects.filter(username__icontains=query).exclude(id=request.user.id)
    else:
        results = User.objects.none()
    following_ids = Follow.objects.filter(follower=request.user).values_list('following_id', flat=True)
    return render(request, 'users/search.html', {
        'query': query,
        'results': results,
        'following_ids': following_ids,
    })

@login_required
def followers_list(request, username):
    target_user = get_object_or_404(User, username=username)
    followers = User.objects.filter(following__following=target_user)
    following_ids = Follow.objects.filter(follower=request.user).values_list('following_id', flat=True)
    return render(request, 'users/follow_list.html', {
        'target_user': target_user,
        'people': followers,
        'following_ids': following_ids,
        'list_title': 'Подписчики',
    })


@login_required
def following_list(request, username):
    target_user = get_object_or_404(User, username=username)
    following = User.objects.filter(followers__follower=target_user)
    following_ids = Follow.objects.filter(follower=request.user).values_list('following_id', flat=True)
    return render(request, 'users/follow_list.html', {
        'target_user': target_user,
        'people': following,
        'following_ids': following_ids,
        'list_title': 'Подписки',
    })


def home(request):
    return render(request, "home.html")