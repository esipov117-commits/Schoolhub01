from django import forms
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
            "language": "Язык",
            "dark_mode": "Тёмная тема",
        }
