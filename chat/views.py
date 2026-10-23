import json  # НОВОЕ: для парсинга JSON от фронтенда
import mimetypes
import os
import uuid

from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.core.files.storage import default_storage
from django.db.models import Count, Q, OuterRef, Subquery
from django.http import JsonResponse
from django.shortcuts import render, redirect, get_object_or_404
from django.views.decorators.http import require_POST
from django.utils.translation import gettext as _

from webpush.push import notify_new_message

from .models import Chat, Message

# Сколько последних сообщений подгружаем в комнату. Раньше грузилась вся
# переписка и каждое сообщение расшифровывалось (Fernet), из-за чего в долгих
# диалогах страница «висла». 200 сообщений хватает с запасом.
CHAT_MESSAGE_WINDOW = 200

# Сколько последних сообщений отдаём в polling для синхронизации реакций:
# новые сообщения приходят отдельно, а реакции на старые иначе не обновлялись бы.
CHAT_REACTION_WINDOW = 50

# Вложения: ограничения и белый список расширений. HTML/SVG/JS не разрешаем —
# они отдаются с того же домена и могли бы выполнить скрипт в браузере.
MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024
MAX_ATTACHMENTS = 10
CHAT_UPLOAD_DIR = 'chat_uploads'

# Набор реакций, как в Telegram: сердечко, огонёк, улыбка, слёзы, глаза,
# какашка и камень.
REACTION_EMOJIS = ['❤️', '🔥', '😄', '😢', '👀', '💩', '🪨']

IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif', '.heic', '.heif'}
# HEIC/HEIF браузеры обычно не показывают — такие файлы отдаём карточкой.
INLINE_IMAGE_EXTENSIONS = IMAGE_EXTENSIONS - {'.heic', '.heif'}
VIDEO_EXTENSIONS = {'.mp4', '.mov', '.webm', '.m4v', '.avi', '.mkv'}
AUDIO_EXTENSIONS = {'.mp3', '.wav', '.ogg', '.oga', '.m4a', '.aac', '.flac', '.opus'}
DOCUMENT_EXTENSIONS = {
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.odt', '.ods', '.odp', '.rtf', '.txt', '.csv', '.md',
}
ARCHIVE_EXTENSIONS = {'.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'}

ALLOWED_ATTACHMENT_EXTENSIONS = (
    IMAGE_EXTENSIONS | VIDEO_EXTENSIONS | AUDIO_EXTENSIONS
    | DOCUMENT_EXTENSIONS | ARCHIVE_EXTENSIONS
)


def _ordered_reactions(reactions):
    """Реакции в стабильном порядке: JSONB не хранит порядок ключей."""
    if not reactions:
        return []
    ordered = [(emoji, reactions[emoji]) for emoji in REACTION_EMOJIS if reactions.get(emoji)]
    ordered += [
        (emoji, users) for emoji, users in reactions.items()
        if emoji not in REACTION_EMOJIS and users
    ]
    return ordered


def _get_chat(request, chat_id):
    return get_object_or_404(Chat, pk=chat_id, participants=request.user)


def _attachment_prefix(chat_id):
    return f'{settings.MEDIA_URL.rstrip("/")}/{CHAT_UPLOAD_DIR}/{chat_id}/'


def _clean_attachments(raw, chat_id):
    """Проверяет вложения из JSON и оставляет только файлы этого чата.

    Клиенту нельзя доверять: иначе в сообщение можно вписать произвольный URL
    или файл из чужого чата.
    """
    try:
        items = json.loads(raw)
    except (ValueError, TypeError):
        return []
    if not isinstance(items, list):
        return []

    prefix = _attachment_prefix(chat_id)
    cleaned = []
    for item in items[:MAX_ATTACHMENTS]:
        if not isinstance(item, dict):
            continue
        url = str(item.get('url') or '')
        if not url.startswith(prefix) or '..' in url or '\\' in url:
            continue
        ext = os.path.splitext(url.split('?', 1)[0])[1].lower()
        if ext not in ALLOWED_ATTACHMENT_EXTENSIONS:
            continue

        original_name = os.path.basename(str(item.get('original_name') or ''))[:180]
        try:
            size = int(item.get('size') or 0)
        except (TypeError, ValueError):
            size = 0

        cleaned.append({
            'file_id': str(item.get('file_id') or '')[:40],
            'url': url,
            'mime_type': mimetypes.guess_type(url)[0] or 'application/octet-stream',
            'original_name': original_name or 'file',
            'size': max(size, 0),
            'is_image': ext in INLINE_IMAGE_EXTENSIONS,
        })
    return cleaned


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
        last_text = msg.text_for(request.user) if (msg and include_last_text) else ''
        if not last_text and msg and msg.attachments:
            last_text = _('Вложение')
        dialogs.append({
            'chat': chat,
            'other': other,
            'last': msg,
            'last_text': last_text,
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

    # НОВОЕ: Передаем во фронтенд вложения и реакции для каждого сообщения
    return render(request, 'chat/chat_room.html', {
        'chat': chat,
        'other': other,
        'other_avatar': _avatar_url(other) if other else None,
        'messages': [
            {
                'm': m, 
                'text': m.text_for(request.user),
                'attachments': m.attachments,  # Массив JSON отправляем в шаблон
                'reactions': m.reactions,      # Словарь JSON отправляем в шаблон
                'reactions_list': _ordered_reactions(m.reactions),
            } for m in messages
        ],
        'last_id': messages[-1].pk if messages else 0,
        'max_attachment_size': MAX_ATTACHMENT_SIZE,
        'max_attachments': MAX_ATTACHMENTS,
        'reaction_emojis': REACTION_EMOJIS,
    })


@login_required
@require_POST
def send_message(request, chat_id):
    chat = _get_chat(request, chat_id)
    text = request.POST.get('body', '').strip()
    
    # НОВОЕ: Читаем JSON-строку вложений от фронтенда (если она передана).
    # Проверяем, что URL ведут только в папку загрузок этого чата.
    attachments_data = _clean_attachments(
        request.POST.get('attachments_json', '[]'),
        chat.pk,
    )

    # НОВОЕ: Сообщение валидно, если есть либо текст, либо хотя бы одно вложение
    if not text and not attachments_data:
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return JsonResponse({'ok': False, 'error': _('Пустое сообщение')}, status=400)
        return redirect('chat_room', chat_id=chat.pk)

    # Используем наш обновленный метод модели, передавая массив вложений
    message = Message.create_encrypted(chat, request.user, text, attachments_data=attachments_data)

    try:
        notify_new_message(message, request.user)
    except Exception:
        # Push — вспомогательная функция: сбой отправки не должен ломать чат.
        pass

    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
        return JsonResponse({
            'ok': True,
            'id': message.pk,
            'text': text,
            'attachments': message.attachments,  # НОВОЕ: Возвращаем вложения в ответе
            'created_at': message.created_at.strftime('%H:%M'),
        })
    return redirect('chat_room', chat_id=chat.pk)


@login_required
@require_POST
def upload_attachment(request, chat_id):
    """Принимает файлы и возвращает метаданные для отправки в сообщении."""
    chat = _get_chat(request, chat_id)
    files = request.FILES.getlist('files')

    if not files:
        return JsonResponse({'ok': False, 'error': _('Файл не выбран')}, status=400)
    if len(files) > MAX_ATTACHMENTS:
        return JsonResponse(
            {'ok': False, 'error': _('Не больше %(count)d файлов за раз') % {'count': MAX_ATTACHMENTS}},
            status=400,
        )

    prepared = []
    for uploaded in files:
        if uploaded.size > MAX_ATTACHMENT_SIZE:
            return JsonResponse(
                {'ok': False, 'error': _('Файл больше %(size)d МБ') % {'size': MAX_ATTACHMENT_SIZE // (1024 * 1024)}},
                status=400,
            )
        original_name = os.path.basename(str(uploaded.name).replace('\\', '/'))[:180]
        ext = os.path.splitext(original_name)[1].lower()
        if ext not in ALLOWED_ATTACHMENT_EXTENSIONS:
            return JsonResponse(
                {'ok': False, 'error': _('Этот тип файла нельзя прикрепить')},
                status=400,
            )
        prepared.append((uploaded, original_name, ext))

    saved_paths = []
    result = []
    try:
        for uploaded, original_name, ext in prepared:
            file_id = uuid.uuid4().hex
            path = default_storage.save(
                f'{CHAT_UPLOAD_DIR}/{chat.pk}/{file_id}{ext}',
                uploaded,
            )
            saved_paths.append(path)
            result.append({
                'file_id': file_id,
                'url': default_storage.url(path),
                'mime_type': mimetypes.guess_type(original_name)[0] or 'application/octet-stream',
                'original_name': original_name or 'file',
                'size': uploaded.size,
                'is_image': ext in INLINE_IMAGE_EXTENSIONS,
            })
    except Exception:
        for path in saved_paths:
            try:
                default_storage.delete(path)
            except Exception:
                pass
        return JsonResponse({'ok': False, 'error': _('Не удалось сохранить файл')}, status=500)

    return JsonResponse({'ok': True, 'attachments': result}, status=201)


@login_required
def poll_messages(request, chat_id):
    """Новые сообщения после указанного id (для опроса раз в несколько секунд)."""
    chat = _get_chat(request, chat_id)
    try:
        after = int(request.GET.get('after', 0))
    except ValueError:
        after = 0

    messages = chat.messages.filter(pk__gt=after).select_related('sender').order_by('created_at')
    recent = (
        chat.messages
        .order_by('-created_at', '-pk')
        .values('id', 'reactions')[:CHAT_REACTION_WINDOW]
    )
    return JsonResponse({
        'messages': [
            {
                'id': m.pk,
                'is_mine': m.sender_id == request.user.pk,
                'sender': m.sender.username,
                'text': m.text_for(request.user),
                'attachments': m.attachments,  # НОВОЕ: Передаем вложения при длинном опросе
                'reactions': m.reactions,      # НОВОЕ: Передаем реакции при длинном опросе
                'created_at': m.created_at.strftime('%H:%M'),
            }
            for m in messages
        ],
        'reactions': [
            {'id': item['id'], 'reactions': item['reactions']}
            for item in recent
        ],
    })


@login_required
@require_POST
def toggle_reaction_view(request, message_id):
    """НОВОЕ: Эндпоинт для переключения (добавления/удаления) реакции пользователя."""
    # Получаем сообщение, проверяя, что пользователь является участником чата
    message = get_object_or_404(Message, pk=message_id, chat__participants=request.user)
    
    # Пытаемся получить эмодзи как из POST-формы, так и из сырого JSON
    emoji = request.POST.get('emoji', '').strip()
    if not emoji and request.content_type == 'application/json':
        try:
            data = json.loads(request.body)
            emoji = data.get('emoji', '').strip()
        except ValueError:
            pass

    if not emoji:
        return JsonResponse({'ok': False, 'error': _('Эмодзи не указан')}, status=400)
    if emoji not in REACTION_EMOJIS:
        return JsonResponse({'ok': False, 'error': _('Неизвестная реакция')}, status=400)

    # Вызываем атомарный метод изменения JSONB поля из модели Message
    message.toggle_reaction(request.user, emoji)

    return JsonResponse({
        'ok': True,
        'id': message.pk,
        'reactions': message.reactions  # Возвращаем обновленное состояние реакций
    })


@login_required
def unread_api(request):
    """Непрочитанные сообщения для колокольчика уведомлений."""
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
        preview = last_unread.text_for(request.user) if last_unread else ''
        if not preview and last_unread and last_unread.attachments:
            preview = _('Вложение')
        total += d['unread']
        items.append({
            'chat_id': d['chat'].pk,
            'sender': d['other'].username,
            'avatar': d['avatar'],
            'preview': preview,
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

