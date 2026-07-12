from django.contrib.auth.decorators import login_required
from django.shortcuts import render

@login_required
def chat_placeholder(request):
    return render(request, 'chat/coming_soon.html')
