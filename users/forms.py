from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.db.models import Q
from django.utils.translation import gettext_lazy as _
from .models import Profile


class UserSettingsForm(forms.ModelForm):
    class Meta:
        model = Profile
        fields = ["language", "dark_mode"]

        widgets = {
            "language": forms.Select(),
            "dark_mode": forms.CheckboxInput(),
        }

        labels = {
            "language": _("Язык"),
            "dark_mode": _("Тёмная тема"),
        }


class RegisterForm(UserCreationForm):
    """Регистрация по username + email. Аккаунт создаётся неактивным."""

    email = forms.EmailField(
        required=True,
        widget=forms.EmailInput(attrs={"autocomplete": "email"}),
    )

    class Meta(UserCreationForm.Meta):
        fields = ["username", "email", "password1", "password2"]

    @staticmethod
    def _is_reclaimable(user):
        """Неактивный аккаунт без подтверждённой почты можно переиспользовать."""
        if user.is_active:
            return False
        profile = getattr(user, "profile", None)
        if profile is not None and profile.email_verified:
            return False
        return True

    def _has_conflict(self, **filters):
        """True, если имя/почту занимает подтверждённый (активный) аккаунт."""
        return any(
            not self._is_reclaimable(user)
            for user in User.objects.filter(**filters)
        )

    def validate_unique(self):
        """Модельная проверка уникальности username не должна блокировать
        переиспользование имени, занятого неподтверждённым аккаунтом."""
        try:
            self.instance.validate_unique(exclude=self._get_validation_exclusions())
        except ValidationError as error:
            error_dict = getattr(error, "error_dict", None)
            username = self.cleaned_data.get("username")
            if (
                error_dict
                and "username" in error_dict
                and username
                and not self._has_conflict(username__iexact=username)
            ):
                del error_dict["username"]
            if error_dict:
                self._update_errors(error)

    def clean_username(self):
        username = self.cleaned_data.get("username")
        if username and self._has_conflict(username__iexact=username):
            raise ValidationError(
                self.instance.unique_error_message(self._meta.model, ["username"]),
                code="duplicate_username",
            )
        return username

    def clean_email(self):
        email = (self.cleaned_data.get("email") or "").strip()
        if email and self._has_conflict(email__iexact=email):
            raise ValidationError(
                "Пользователь с такой почтой уже зарегистрирован"
            )
        return email

    def save(self, commit=True):
        username = self.cleaned_data.get("username")
        email = (self.cleaned_data.get("email") or "").strip()

        # Подвисшие неподтверждённые аккаунты не должны блокировать повторную
        # регистрацию: удаляем их, чтобы имя и почту можно было занять заново.
        stale = User.objects.filter(
            Q(username__iexact=username) | Q(email__iexact=email)
        )
        for old in stale:
            if self._is_reclaimable(old):
                old.delete()

        user = super().save(commit=False)
        user.email = email
        user.is_active = False
        if commit:
            user.save()
        return user


class EmailVerifyForm(forms.Form):
    """Форма подтверждения почты для уже существующих пользователей."""

    email = forms.EmailField(
        required=True,
        widget=forms.EmailInput(attrs={"autocomplete": "email"}),
    )

    def __init__(self, *args, user=None, **kwargs):
        self.user = user
        super().__init__(*args, **kwargs)

    def clean_email(self):
        email = (self.cleaned_data.get("email") or "").strip()
        qs = User.objects.filter(email__iexact=email)
        if self.user is not None:
            qs = qs.exclude(pk=self.user.pk)
        if qs.exists():
            raise forms.ValidationError(
                "Эта почта уже используется другим аккаунтом"
            )
        return email
