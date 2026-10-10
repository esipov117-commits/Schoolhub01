from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.db.models import Count, Q, OuterRef, Subquery
from django.http import JsonResponse
from django.shortcuts import render, redirect, get_object_or_404
from django.views.decorators.http import require_POST

from .models import Chat, Message

# Сколько последних сообщений подгружаем в комнату. Раньше грузилась вся
# переписка и каждое сообщение расшифровывалось (Fernet), из-за чего в долгих
# диалогах страница «висла». 200 сообщений хватает с запасом.
CHAT_MESSAGE_WINDOW = 200


def _get_chat(request, chat_id):
    return get_object_or_404(Chat, pk=chat_id, participants=request.user)


def _avatar_url(user):
    profile = getattr(user, 'profile', None)
    if profile and profile.avatar:
        return profile.avatar.url
    return None


def _dialogs_qs(request):
    """Все диалоги пользователя одним запросом: счётчик непрочитанных,
    id последнего сообщения и участники (с профилями) — без N+1."""
    return (
        request.user.chats
        .annotate(
            unread=Count(
                'messages',
                filter=~Q(messages__sender=request.user)
                & ~Q(messages__read_by__contains=[str(request.user.pk)]),
                distinct=True,
            ),
            last_message_id=Subquery(
                Message.objects
                .filter(chat=OuterRef('pk'))
                .order_by('-created_at', '-pk')
                .values('pk')[:1]
            ),
        )
        .prefetch_related('participants__profile')
        .order_by('-updated_at')
    )


def _bulk_dialogs(request, chats, include_last_text=True):
    """Собирает список диалогов, не делая запросов на каждый чат."""
    chats = list(chats)
    if not chats:
        return []

    last_ids = [c.last_message_id for c in chats if c.last_message_id]
    last_map = {}
    if last_ids:
        last_map = {
            m.pk: m
            for m in Message.objects.filter(pk__in=last_ids)
        }

    dialogs = []
    for chat in chats:
        other = next(
            (p for p in chat.participants.all() if p.pk != request.user.pk),
            None,
        )
        msg = last_map.get(chat.last_message_id)
        dialogs.append({
            'chat': chat,
            'other': other,
            'last': msg,
            'last_text': msg.text_for(request.user) if (msg and include_last_text) else '',
            'unread': chat.unread,
            'avatar': _avatar_url(other) if other else None,
        })
    return dialogs


@login_required
def chat_list(request):
    if request.method == 'POST':
        return start_chat(request)

    dialogs = _bulk_dialogs(request, _dialogs_qs(request))
    return render(request, 'chat/chat_list.html', {'dialogs': dialogs})


@login_required
def chat_room(request, chat_id):
    chat = _get_chat(request, chat_id)
    other = chat.interlocutor(request.user)

    if request.method == 'POST':
        return send_message(request, chat_id)

    messages = list(
        chat.messages
        .select_related('sender')
        .order_by('-created_at', '-pk')[:CHAT_MESSAGE_WINDOW]
    )
    messages.reverse()

    # Помечаем прочитанными одним batch-запросом вместо N сохранений.
    to_mark = [
        m for m in messages
        if m.sender_id != request.user.pk and str(request.user.pk) not in m.read_by
    ]
    for m in to_mark:
        m.read_by.append(str(request.user.pk))
    if to_mark:
        Message.objects.bulk_update(to_mark, ['read_by'], batch_size=100)

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

    messages = chat.messages.filter(pk__gt=after).select_related('sender').order_by('created_at')
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
    """Непрочитанные сообщения для колокольчика уведомлений.

    Эндпоинт опрашивается каждые несколько секунд, поэтому здесь важно
    обойтись минимумом запросов: один batch-запрос за последними непрочитанными
    сообщениями вместо запроса на каждый чат.
    """
    dialogs = _bulk_dialogs(request, _dialogs_qs(request), include_last_text=False)
    relevant = [d for d in dialogs if d['unread'] and d['other']]
    if not relevant:
        return JsonResponse({'count': 0, 'items': []})

    chat_ids = [d['chat'].pk for d in relevant]
    last_unread_map = {}
    unread_messages = (
        Message.objects
        .filter(chat_id__in=chat_ids)
        .exclude(sender=request.user)
        .exclude(read_by__contains=[str(request.user.pk)])
        .select_related('sender')
        .order_by('chat_id', '-created_at', '-pk')
    )
    for m in unread_messages:
        last_unread_map.setdefault(m.chat_id, m)

    items = []
    total = 0
    for d in relevant:
        last_unread = last_unread_map.get(d['chat'].pk)
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
