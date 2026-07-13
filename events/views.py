from django.shortcuts import render, redirect, get_object_or_404
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
        image = request.FILES.get('image')

        if title and date:
            Event.objects.create(
                title=title,
                description=description,
                date=date,
                location=location,
                image=image,
                created_by=request.user
            )
            return redirect('events_list')

    return render(request, 'events/create_event.html')


@login_required
def edit_event(request, pk):
    event = get_object_or_404(Event, pk=pk)

    # Право редактировать есть только у организаторов
    if not request.user.profile.is_organizer:
        return redirect('events_list')

    if request.method == 'POST':
        title = request.POST.get('title')
        date = request.POST.get('date')

        if title and date:
            event.title = title
            event.description = request.POST.get('description')
            event.date = date
            event.location = request.POST.get('location')

            image = request.FILES.get('image')
            if image:
                event.image = image

            event.save()
            return redirect('events_list')

    return render(request, 'events/edit_event.html', {'event': event})


@login_required
def delete_event(request, pk):
    event = get_object_or_404(Event, pk=pk)

    # Удалять может только организатор, и только через POST
    # (чтобы событие нельзя было случайно удалить одной ссылкой)
    if request.user.profile.is_organizer and request.method == 'POST':
        event.delete()

    return redirect('events_list')
