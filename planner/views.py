from django.shortcuts import render, redirect
from .models import CalendarEvent
from .forms import CalendarEventForm


def calendar_view(request):

    events = CalendarEvent.objects.filter(
        user=request.user
    ).order_by("date", "start_time")


    if request.method == "POST":

        form = CalendarEventForm(request.POST)

        if form.is_valid():

            event = form.save(commit=False)

            event.user = request.user

            event.save()

            return redirect("calendar")


    else:
        form = CalendarEventForm()


    return render(
        request,
        "calendar.html",
        {
            "events": events,
            "form": form
        }
    )