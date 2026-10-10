from django.conf import settings
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.forms import UserCreationForm, AuthenticationForm
from django.contrib.auth import login as auth_login
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.utils import timezone
from tasks.models import TodoTask
from .models import Profile, Follow, downscale_image
from posts.models import Post
from events.models import Event

REMEMBERED_USER_COOKIE = 'sh_remembered_user'


def _get_remembered_user(request):
    username = request.COOKIES.get(REMEMBERED_USER_COOKIE, '')
    if not username:
        return None
    return User.objects.filter(username=username).first()


def login_view(request):
    if request.user.is_authenticated:
        return redirect('home')

    other = request.GET.get('other') == '1' or request.POST.get('other') == '1'
    remembered = None if other else _get_remembered_user(request)

    if request.method == 'POST':
        form = AuthenticationForm(request, request.POST)
        if form.is_valid():
            auth_login(request, form.get_user())
            response = redirect('home')
            response.set_cookie(
                REMEMBERED_USER_COOKIE,
                form.get_user().username,
                max_age=365 * 24 * 60 * 60,
                httponly=True,
                secure=not settings.DEBUG,
                samesite='Lax',
            )
            return response
    else:
        form = AuthenticationForm(request)

    context = {
        'form': form,
        'can_back': other and _get_remembered_user(request) is not None,
    }
    if remembered:
        profile_obj, _ = Profile.objects.get_or_create(user=remembered)
        context['remembered'] = remembered
        context['remembered_profile'] = profile_obj
    return render(request, 'registration/login.html', context)


def _build_profile_context(request, target_user):
    profile_obj, _ = Profile.objects.get_or_create(user=target_user)
    user_posts = Post.objects.filter(author=target_user)
    is_own_profile = (target_user == request.user)
    posts_count = user_posts.count()
    followers_count = target_user.followers.count()
    following_count = target_user.following.count()
    is_following = Follow.objects.filter(follower=request.user, following=target_user).exists()

    return {
        'profile': profile_obj,
        'user_posts': user_posts,
        'profile_user': target_user,
        'is_own_profile': is_own_profile,
        'posts_count': posts_count,
        'followers_count': followers_count,
        'following_count': following_count,
        'is_following': is_following,
    }


def register(request):
    if request.method == 'POST':
        form = UserCreationForm(request.POST)
        if form.is_valid():
            user = form.save()
            Profile.objects.create(user=user)
            return redirect('login')
    else:
        form = UserCreationForm()

    return render(request, 'users/register.html', {'form': form})


def home(request):
    if not request.user.is_authenticated:
        if request.COOKIES.get(REMEMBERED_USER_COOKIE):
            return redirect('login')
        return render(request, 'welcome.html')

    Profile.objects.get_or_create(user=request.user)

    tasks = TodoTask.objects.filter(user=request.user)
    recent_posts = Post.objects.all()[:3]
    upcoming_events = Event.objects.filter(date__gte=timezone.now()).order_by('date')[:3]

    stats = {
        'posts_count': Post.objects.filter(author=request.user).count(),
        'friends_count': 0,   # пока нет системы друзей
        'groups_count': 0,    # пока нет групп
    }

    return render(request, 'home.html', {
        'tasks': tasks,
        'recent_posts': recent_posts,
        'upcoming_events': upcoming_events,
        'stats': stats,
    })


@login_required
def profile(request, username=None):
    if username:
        target_user = get_object_or_404(User, username=username)
    else:
        target_user = request.user

    context = _build_profile_context(request, target_user)
    context['active_section'] = 'wall'
    return render(request, 'users/profile.html', context)


@login_required
def profile_friends(request, username):
    target_user = get_object_or_404(User, username=username)
    context = _build_profile_context(request, target_user)

    follower_ids = set(Follow.objects.filter(follower=target_user).values_list('following_id', flat=True))
    following_ids = set(Follow.objects.filter(following=target_user).values_list('follower_id', flat=True))
    friend_ids = follower_ids & following_ids
    friends = User.objects.filter(id__in=friend_ids).order_by('username')

    for friend in friends:
        Profile.objects.get_or_create(user=friend)

    context['active_section'] = 'friends'
    context['friends'] = friends
    return render(request, 'users/friends.html', context)


@login_required
def profile_photos(request, username):
    target_user = get_object_or_404(User, username=username)
    context = _build_profile_context(request, target_user)

    photos = []
    for post in Post.objects.filter(author=target_user).prefetch_related('images'):
        for image in post.images.all():
            photos.append(image)

    context['active_section'] = 'photos'
    context['photos'] = photos
    context['photos_count'] = len(photos)
    return render(request, 'users/photos.html', context)


@login_required
def edit_profile(request):
    profile_obj, created = Profile.objects.get_or_create(user=request.user)

    if request.method == 'POST':
        profile_obj.display_name = request.POST.get('display_name') or profile_obj.display_name
        profile_obj.group_name = request.POST.get('group_name') or profile_obj.group_name
        profile_obj.status = request.POST.get('status', '')
        profile_obj.bio = request.POST.get('bio', '')

        avatar = request.FILES.get('avatar')
        if avatar:
            profile_obj.avatar = downscale_image(avatar, 400) or avatar

        banner = request.FILES.get('banner')
        if banner:
            profile_obj.banner = downscale_image(banner, 1600) or banner
        try:
            banner_position = int(request.POST.get('banner_position', profile_obj.banner_position or 50))
        except (TypeError, ValueError):
            banner_position = profile_obj.banner_position or 50
        profile_obj.banner_position = max(0, min(100, banner_position))

        profile_obj.save()
        return redirect('profile')

    return render(request, 'users/edit_profile.html', {'profile': profile_obj})


@login_required
def settings_page(request):
    profile_obj, _ = Profile.objects.get_or_create(user=request.user)

    if request.method == "POST":
        profile_obj.dark_mode = request.POST.get("dark_mode") == "on"
        profile_obj.save(update_fields=["dark_mode"])
        return redirect("settings")

    return render(request, "users/settings.html", {
        "profile": profile_obj,
    })


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