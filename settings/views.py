from django.contrib.auth.decorators import login_required
from django.shortcuts import render, redirect


@login_required
def settings_view(request):
    profile = request.user.profile

    if request.method == "POST":
        profile.dark_mode = request.POST.get("dark_mode") == "on"
        profile.save(update_fields=["dark_mode"])
        return redirect("settings")

    return render(request, "settings/settings.html", {
        "profile": profile,
    })


@login_required
def toggle_theme(request):
    if request.method == "POST":
        profile = request.user.profile
        profile.dark_mode = not profile.dark_mode
        profile.save(update_fields=["dark_mode"])

    return redirect(request.META.get("HTTP_REFERER", "/"))