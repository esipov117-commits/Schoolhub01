from django import forms
from .models import CalendarEvent


class CalendarEventForm(forms.ModelForm):

    class Meta:

        model = CalendarEvent

        fields = [
            "title",
            "description",
            "date",
            "start_time",
            "end_time",
            "event_type"
        ]

        widgets = {

            "date": forms.DateInput(
                attrs={
                    "type": "date"
                }
            ),

            "start_time": forms.TimeInput(
                attrs={
                    "type": "time"
                }
            ),

            "end_time": forms.TimeInput(
                attrs={
                    "type": "time"
                }
            ),

        }