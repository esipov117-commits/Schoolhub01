def email_verification(request):
    """Флаг для шаблонов: нужно ли показывать баннер подтверждения почты."""
    user = getattr(request, 'user', None)
    if user is None or not user.is_authenticated:
        return {
            'email_verification_needed': False,
            'user_email': '',
        }

    # getattr безопасно вернёт None, если профиля ещё нет.
    profile = getattr(user, 'profile', None)
    return {
        'email_verification_needed': bool(profile) and not profile.email_verified,
        'user_email': user.email or '',
    }
