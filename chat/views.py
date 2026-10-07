from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.http import JsonResponse
from django.shortcuts import render, redirect, get_object_or_404
from django.views.decorators.http import require_POST

from .models import Chat, Message


def _get_chat(request, chat_id):
    return get_object_or_404(Chat, pk=chat_id, participants=request.user)


def _avatar_url(user):
    profile = getattr(user, 'profile', None)
    if profile and profile.avatar:
        return profile.avatar.url
    return None


def _dialog_data(request, chat):
    other = chat.interlocutor(request.user)
    last = chat.messages.order_by('-created_at').first()
    return {
        'chat': chat,
        'other': other,
        'last_text': last.text_for(request.user) if last else '',
        'last': last,
        'unread': chat.unread_count_for(request.user),
        'avatar': _avatar_url(other) if other else None,
    }


@login_required
def chat_list(request):
    if request.method == 'POST':
        return start_chat(request)

    dialogs = [
        _dialog_data(request, chat)
        for chat in request.user.chats.order_by('-updated_at')
    ]
    return render(request, 'chat/chat_list.html', {'dialogs': dialogs})


@login_required
def chat_room(request, chat_id):
    chat = _get_chat(request, chat_id)
    other = chat.interlocutor(request.user)

    if request.method == 'POST':
        return send_message(request, chat_id)

    messages = list(chat.messages.order_by('created_at'))
    for message in messages:
        message.mark_read_by(request.user)

    return render(request, 'chat/chat_room.html', {
        'chat': chat,
        'other': other,
        'other_avatar': _avatar_url(other) if other else None,
        'messages': [
            {'m': m, 'text': m.text_for(request.user)} for m in messages
        ],
        'last_id': messages[-1].pk if messages else 0,
    })


@login_required
@require_POST
def send_message(request, chat_id):
    chat = _get_chat(request, chat_id)
    text = request.POST.get('body', '').strip()
    if not text:
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return JsonResponse({'ok': False, 'error': 'Пустое сообщение'}, status=400)
        return redirect('chat_room', chat_id=chat.pk)

    message = Message.create_encrypted(chat, request.user, text)

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return JsonResponse({
            'ok': True,
            'id': message.pk,
            'text': text,
            'created_at': message.created_at.strftime('%H:%M'),
        })
    return redirect('chat_room', chat_id=chat.pk)


@login_required
def poll_messages(request, chat_id):
    """Новые сообщения после указанного id (для опроса раз в несколько секунд)."""
    chat = _get_chat(request, chat_id)
    try:
        after = int(request.GET.get('after', 0))
    except ValueError:
        after = 0

    messages = chat.messages.filter(pk__gt=after).order_by('created_at')
    return JsonResponse({
        'messages': [
            {
                'id': m.pk,
                'is_mine': m.sender_id == request.user.pk,
                'sender': m.sender.username,
                'text': m.text_for(request.user),
                'created_at': m.created_at.strftime('%H:%M'),
            }
            for m in messages
        ],
    })


@login_required
def unread_api(request):
    """Непрочитанные сообщения для колокольчика уведомлений."""
    dialogs = [
        _dialog_data(request, chat)
        for chat in request.user.chats.order_by('-updated_at')
    ]
    items = []
    total = 0
    for d in dialogs:
        if not d['unread'] or not d['other']:
            continue
        last_unread = (
            d['chat'].messages
            .exclude(sender=request.user)
            .exclude(read_by__contains=[str(request.user.pk)])
            .order_by('-created_at')
            .first()
        )
        total += d['unread']
        items.append({
            'chat_id': d['chat'].pk,
            'sender': d['other'].username,
            'avatar': d['avatar'],
            'preview': last_unread.text_for(request.user) if last_unread else '',
            'time': last_unread.created_at.strftime('%H:%M') if last_unread else '',
            'count': d['unread'],
        })
    return JsonResponse({'count': total, 'items': items})


@login_required
@require_POST
def start_chat(request):
    username = request.POST.get('username', '').strip()
    other = get_object_or_404(User, username=username)
    if other == request.user:
        return redirect('chat')

    chat = (
        Chat.objects
        .filter(participants=request.user)
        .filter(participants=other)
        .first()
    )
    if not chat:
        chat = Chat.objects.create()
        chat.participants.set([request.user, other])
    return redirect('chat_room', chat_id=chat.pk)
