from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.models import User
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

    def clean_email(self):
        email = (self.cleaned_data.get("email") or "").strip()
        if User.objects.filter(email__iexact=email).exists():
            raise forms.ValidationError(
                "Пользователь с такой почтой уже зарегистрирован"
            )
        return email

    def save(self, commit=True):
        user = super().save(commit=False)
        user.email = self.cleaned_data["email"].strip()
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
