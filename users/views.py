import json
from urllib.parse import quote, unquote

from django.conf import settings
from django.core.paginator import Paginator
from django.http import JsonResponse
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib import messages
from django.contrib.auth.forms import AuthenticationForm
from django.contrib.auth import login as auth_login
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.utils import translation
from django.utils.translation import gettext as _
from django.views.decorators.http import require_POST
from .forms import RegisterForm
from .models import Profile, Follow, downscale_image
from posts.models import Post, PostImage

REMEMBERED_USER_COOKIE = 'sh_remembered_user'

PROFILE_POSTS_PER_PAGE = 10
PHOTOS_PER_PAGE = 24
PEOPLE_PER_PAGE = 60


HEADERS_SAFE = "~@._-"


def _encode_cookie_username(username):
    """Превращает username в ASCII-safe значение для Cookie.

    Кириллические имена в заголовке Cookie невалидны: gunicorn/nginx
    отбрасывают такие запросы с 400/502. Внутри храним percent-encoded
    значение, при чтении декодируем обратно.
    """
    try:
        return quote(username, safe=HEADERS_SAFE)
    except Exception:
        return username


def _decode_cookie_username(value):
    try:
        return unquote(value)
    except Exception:
        return ''


def _get_remembered_user(request):
    raw = request.COOKIES.get(REMEMBERED_USER_COOKIE, '')
    if not raw:
        return None
    # Старая незакодированная кука с невалидными (не-ASCII) значениями
    # игнорируется — она и так ломает парсинг на nginx/gunicorn.
    if any(ord(ch) > 127 for ch in raw):
        return None
    username = _decode_cookie_username(raw)
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
                _encode_cookie_username(form.get_user().username),
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
    is_own_profile = (target_user == request.user)
    return {
        'profile': profile_obj,
        'profile_user': target_user,
        'is_own_profile': is_own_profile,
        'posts_count': Post.objects.filter(author=target_user).count(),
        'followers_count': target_user.followers.count(),
        'following_count': target_user.following.count(),
        'is_following': (
            not is_own_profile
            and Follow.objects.filter(follower=request.user, following=target_user).exists()
        ),
    }


def register(request):
    if request.user.is_authenticated:
        return redirect('home')

    if request.method == 'POST':
        form = RegisterForm(request.POST)
        if form.is_valid():
            user = form.save()
            Profile.objects.get_or_create(user=user)
            auth_login(request, user)
            response = redirect('home')
            response.set_cookie(
                REMEMBERED_USER_COOKIE,
                _encode_cookie_username(user.username),
                max_age=365 * 24 * 60 * 60,
                httponly=True,
                secure=not settings.DEBUG,
                samesite='Lax',
            )
            return response
    else:
        form = RegisterForm()

    return render(request, 'users/register.html', {'form': form})


def home(request):
    if not request.user.is_authenticated:
        if request.COOKIES.get(REMEMBERED_USER_COOKIE):
            return redirect('login')
        return render(request, 'welcome.html')

    Profile.objects.get_or_create(user=request.user)

    from posts.views import feed
    return feed(request)


@login_required
def profile(request, username=None):
    if username:
        target_user = get_object_or_404(User, username=username)
    else:
        target_user = request.user

    context = _build_profile_context(request, target_user)
    posts_qs = (
        Post.objects
        .filter(author=target_user)
        .prefetch_related('images')
        .order_by('-created_at')
    )
    page_obj = Paginator(posts_qs, PROFILE_POSTS_PER_PAGE).get_page(request.GET.get('page'))
    context['user_posts'] = page_obj.object_list
    context['page_obj'] = page_obj
    context['active_section'] = 'wall'
    return render(request, 'users/profile.html', context)


@login_required
def profile_friends(request, username):
    target_user = get_object_or_404(User, username=username)
    context = _build_profile_context(request, target_user)

    follower_ids = set(Follow.objects.filter(follower=target_user).values_list('following_id', flat=True))
    following_ids = set(Follow.objects.filter(following=target_user).values_list('follower_id', flat=True))
    friend_ids = follower_ids & following_ids
    friends = User.objects.filter(id__in=friend_ids).select_related('profile').order_by('username')

    context['active_section'] = 'friends'
    context['friends'] = friends
    return render(request, 'users/friends.html', context)


@login_required
def profile_photos(request, username):
    target_user = get_object_or_404(User, username=username)
    context = _build_profile_context(request, target_user)

    photos_qs = (
        PostImage.objects
        .filter(post__author=target_user)
        .select_related('post')
        .order_by('-post__created_at', 'order', 'id')
    )
    page_obj = Paginator(photos_qs, PHOTOS_PER_PAGE).get_page(request.GET.get('page'))

    context['active_section'] = 'photos'
    context['photos'] = page_obj.object_list
    context['photos_count'] = photos_qs.count()
    context['page_obj'] = page_obj
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
        changed = []

        dark_mode = request.POST.get("dark_mode") == "on"
        if dark_mode != profile_obj.dark_mode:
            profile_obj.dark_mode = dark_mode
            changed.append("dark_mode")

        language = request.POST.get("language")
        if language and language != profile_obj.language and language in dict(settings.LANGUAGES):
            profile_obj.language = language
            changed.append("language")

        if changed:
            profile_obj.save(update_fields=changed)
        if "language" in changed:
            translation.activate(profile_obj.language)

        return redirect("settings")

    return render(request, "users/settings.html", {
        "profile": profile_obj,
        "languages": settings.LANGUAGES,
    })


@login_required
@require_POST
def set_language(request):
    """Быстрая смена языка без перезагрузки формы настроек.

    Ожидает JSON `{"language": "en"}` и возвращает актуальный код языка.
    """
    profile_obj, _ = Profile.objects.get_or_create(user=request.user)
    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except (ValueError, UnicodeDecodeError):
        payload = {}

    language = payload.get("language")
    if language not in dict(settings.LANGUAGES):
        return JsonResponse({"ok": False, "error": "unsupported"}, status=400)

    if language != profile_obj.language:
        profile_obj.language = language
        profile_obj.save(update_fields=["language"])

    translation.activate(language)
    return JsonResponse({"ok": True, "language": language})


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
        results = (
            User.objects
            .filter(username__icontains=query)
            .exclude(id=request.user.id)
            .select_related('profile')
            .order_by('username')[:PEOPLE_PER_PAGE]
        )
    else:
        results = User.objects.none()

    following_ids = set(
        Follow.objects.filter(follower=request.user).values_list('following_id', flat=True)
    )

    return render(request, 'users/search.html', {
        'query': query,
        'results': results,
        'following_ids': following_ids,
    })


@login_required
def followers_list(request, username):
    target_user = get_object_or_404(User, username=username)
    followers = (
        User.objects
        .filter(following__following=target_user)
        .select_related('profile')
        .order_by('username')[:PEOPLE_PER_PAGE]
    )
    following_ids = set(
        Follow.objects.filter(follower=request.user).values_list('following_id', flat=True)
    )

    return render(request, 'users/follow_list.html', {
        'target_user': target_user,
        'people': followers,
        'following_ids': following_ids,
        'list_title': _('Подписчики'),
    })


@login_required
def following_list(request, username):
    target_user = get_object_or_404(User, username=username)
    following = (
        User.objects
        .filter(followers__follower=target_user)
        .select_related('profile')
        .order_by('username')[:PEOPLE_PER_PAGE]
    )
    following_ids = set(
        Follow.objects.filter(follower=request.user).values_list('following_id', flat=True)
    )

    return render(request, 'users/follow_list.html', {
        'target_user': target_user,
        'people': following,
        'following_ids': following_ids,
        'list_title': _('Подписки'),
    })


@login_required
def delete_user(request, user_id):
    if not request.user.is_staff and not request.user.profile.is_moderator:
        return redirect('home')
    target = get_object_or_404(User, id=user_id)
    if target.is_superuser or target == request.user:
        return redirect('profile_user', username=target.username)
    if request.method == 'POST':
        target.delete()
        return redirect('home')
    return render(request, 'users/confirm_delete_user.html', {
        'target_user': target,
    })