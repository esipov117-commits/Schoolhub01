from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.utils import timezone
from .models import Event


def events_list(request):
    upcoming_events = Event.objects.filter(date__gte=timezone.now())
    return render(request, 'events/events_list.html', {'events': upcoming_events})


@login_required
def create_event(request):
    # Проверяем, есть ли у пользователя право создавать события
    if not request.user.profile.is_organizer:
        return redirect('events_list')

    if request.method == 'POST':
        title = request.POST.get('title')
        description = request.POST.get('description')
        date = request.POST.get('date')
        location = request.POST.get('location')

        if title and date:
            Event.objects.create(
                title=title,
                description=description,
                date=date,
                location=location,
                created_by=request.user
            )
            return redirect('events_list')

    return render(request, 'events/create_event.html')