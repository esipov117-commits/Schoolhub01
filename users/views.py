import json
import logging

from django.conf import settings
from django.core.paginator import Paginator
from django.http import JsonResponse
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib import messages
from django.contrib.auth.forms import AuthenticationForm
from django.contrib.auth import login as auth_login
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.urls import reverse
from django.utils import timezone, translation
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.translation import gettext as _
from django.views.decorators.http import require_POST
from .forms import RegisterForm, EmailVerifyForm
from .models import Profile, Follow, downscale_image
from posts.models import Post, PostImage

logger = logging.getLogger(__name__)

REMEMBERED_USER_COOKIE = 'sh_remembered_user'

PROFILE_POSTS_PER_PAGE = 10
PHOTOS_PER_PAGE = 24
PEOPLE_PER_PAGE = 60


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

    pending_activation_email = None
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

        # Аккаунт существует, но почта не подтверждена — предлагаем отправить ссылку снова.
        username = request.POST.get('username', '')
        inactive = User.objects.filter(
            username__iexact=username, is_active=False,
        ).first()
        if inactive:
            pending_activation_email = inactive.email
            if pending_activation_email:
                request.session['activation_email'] = pending_activation_email
    else:
        form = AuthenticationForm(request)

    context = {
        'form': form,
        'can_back': other and _get_remembered_user(request) is not None,
        'pending_activation': pending_activation_email is not None,
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


def _site_origin(request):
    """Базовый URL сайта для ссылок в письмах (устойчив к DisallowedHost)."""
    try:
        return request.build_absolute_uri('/').rstrip('/')
    except Exception:
        return getattr(settings, 'SITE_URL', 'http://localhost:8000').rstrip('/')


def _build_verification_url(request, user):
    uidb64 = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    path = reverse('activate', kwargs={'uidb64': uidb64, 'token': token})
    return _site_origin(request) + path


def send_verification_email(request, user):
    """Отправляет ссылку подтверждения. Возвращает (ok, error_message)."""
    try:
        if not user.email:
            return False, 'Адрес почты не указан'

        context = {
            'username': user.username,
            'link': _build_verification_url(request, user),
        }
        subject = render_to_string(
            'users/emails/verification_subject.txt', context,
        ).strip()
        body = render_to_string('users/emails/verification_email.txt', context)

        sent = send_mail(
            subject,
            body,
            settings.DEFAULT_FROM_EMAIL,
            [user.email],
            fail_silently=False,
        )
        if sent == 1:
            return True, ''
        return False, 'Почтовый сервер не принял письмо'
    except Exception as exc:
        logger.exception('Не удалось отправить письмо подтверждения на %s', user.email)
        return False, f'{type(exc).__name__}: {exc}'


def _resend_allowed(profile):
    """True, если прошло достаточно времени с прошлой отправки ссылки."""
    cooldown = settings.EMAIL_RESEND_COOLDOWN
    if not profile.verification_sent_at:
        return True, cooldown
    elapsed = (timezone.now() - profile.verification_sent_at).total_seconds()
    if elapsed >= cooldown:
        return True, cooldown
    return False, int(cooldown - elapsed)


def register(request):
    if request.user.is_authenticated:
        return redirect('home')

    if request.method == 'POST':
        form = RegisterForm(request.POST)
        if form.is_valid():
            user = form.save()
            Profile.objects.get_or_create(user=user)
            request.session['activation_email'] = user.email

            profile = getattr(user, 'profile', None)
            if profile:
                profile.verification_sent_at = timezone.now()
                profile.save(update_fields=['verification_sent_at'])

            ok, err = send_verification_email(request, user)
            if not ok:
                msg = (
                    'Аккаунт создан, но письмо отправить не удалось. '
                    'Нажмите «Отправить ещё раз» чуть позже.'
                )
                if settings.DEBUG and err:
                    msg += f' ({err})'
                messages.warning(request, msg)
            return redirect('activation_sent')
    else:
        form = RegisterForm()

    return render(request, 'users/register.html', {'form': form})


def activation_sent(request):
    email = request.session.get('activation_email', '')
    return render(request, 'users/activation_sent.html', {'email': email})


def resend_activation(request):
    if request.method != 'POST':
        return redirect('activation_sent')

    email = request.session.get('activation_email') or request.POST.get('email', '')
    user = User.objects.filter(email__iexact=email).first() if email else None

    if user is None or user.is_active:
        return redirect('activation_sent')

    profile, _ = Profile.objects.get_or_create(user=user)
    allowed, value = _resend_allowed(profile)
    if not allowed:
        messages.warning(
            request,
            f'Письмо уже отправлено. Повторите примерно через {value} с.',
        )
        return redirect('activation_sent')

    profile.verification_sent_at = timezone.now()
    profile.save(update_fields=['verification_sent_at'])

    ok, err = send_verification_email(request, user)
    if ok:
        messages.success(request, 'Письмо с подтверждением отправлено повторно.')
    else:
        msg = 'Не удалось отправить письмо. Попробуйте позже.'
        if settings.DEBUG and err:
            msg += f' ({err})'
        messages.error(request, msg)
    return redirect('activation_sent')


def activate(request, uidb64, token):
    try:
        uid = force_str(urlsafe_base64_decode(uidb64))
        user = User.objects.get(pk=uid)
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        user = None

    if user is not None and default_token_generator.check_token(user, token):
        user.is_active = True
        user.save(update_fields=['is_active'])

        profile, _ = Profile.objects.get_or_create(user=user)
        profile.email_verified = True
        profile.email_verified_at = timezone.now()
        profile.save(update_fields=['email_verified', 'email_verified_at'])

        request.session.pop('activation_email', None)

        already_this_user = (
            request.user.is_authenticated and request.user.pk == user.pk
        )
        if not already_this_user:
            auth_login(request, user)

        messages.success(request, 'Почта подтверждена! Добро пожаловать в SchoolHub.')
        return redirect('home')

    return render(request, 'users/activation_invalid.html', status=400)


@login_required
def verify_email(request):
    """Страница подтверждения почты для уже существующих пользователей."""
    profile, _ = Profile.objects.get_or_create(user=request.user)

    if profile.email_verified:
        return redirect('home')

    if request.method == 'POST':
        form = EmailVerifyForm(request.POST, user=request.user)
        if form.is_valid():
            request.user.email = form.cleaned_data['email']
            request.user.save(update_fields=['email'])

            allowed, value = _resend_allowed(profile)
            if allowed:
                profile.verification_sent_at = timezone.now()
                profile.save(update_fields=['verification_sent_at'])
                ok, err = send_verification_email(request, request.user)
                if ok:
                    messages.success(
                        request,
                        'Мы отправили ссылку подтверждения. Проверьте почту.',
                    )
                else:
                    msg = 'Не удалось отправить письмо. Попробуйте позже.'
                    if settings.DEBUG and err:
                        msg += f' ({err})'
                    messages.error(request, msg)
            else:
                messages.warning(
                    request,
                    f'Письмо уже отправлено. Повторите примерно через {value} с.',
                )
            return redirect('verify_email')
    else:
        form = EmailVerifyForm(user=request.user, initial={'email': request.user.email})

    return render(request, 'users/verify_email.html', {'form': form})


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