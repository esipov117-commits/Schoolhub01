from django.shortcuts import get_object_or_404, redirect, render
from django.contrib.auth.decorators import login_required
from .models import TodoTask


@login_required
def create_task(request):
    if request.method == "POST":
        title = request.POST.get("title")
        if title:
            TodoTask.objects.create(user=request.user, title=title)
    return redirect("home")


@login_required
def delete_task(request, task_id):
    task = get_object_or_404(TodoTask, id=task_id, user=request.user)
    task.delete()
    return redirect("home")


@login_required
def complete_task(request, id):
    task = get_object_or_404(TodoTask, id=id, user=request.user)
    task.completed = not task.completed
    task.save()
    return redirect("home")