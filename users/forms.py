from django import forms
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
