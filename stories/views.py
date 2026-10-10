from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.utils import timezone
import os

from .models import Story
from users.models import downscale_image


@login_required
def stories_bar(request):
    """
    Поскольку отдельной страницы для историй нет (они находятся внутри главной ленты feed),
    при любом прямом GET-запросе на этот URL просто перенаправляем пользователя на главную ленту.
    """
    return redirect('feed')


@login_required
def upload_story(request):
    """Загрузка новой истории (Универсальная AJAX + HTML)."""
    if request.method == 'POST':
        file = request.FILES.get('media')
        caption = request.POST.get('caption', '')
        is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'

        if not file:
            if is_ajax:
                return JsonResponse({'error': 'Нет файла'}, status=400)
            # Если JS не сработал, возвращаем на feed с ошибкой (или просто редиректим)
            return redirect('feed')

        # Мобильные файловые менеджеры часто отдают пустой/неверный content_type,
        # поэтому тип определяем и по расширению.
        video_exts = ('.mp4', '.mov', '.m4v', '.webm', '.avi', '.mkv', '.3gp')
        ext = os.path.splitext(file.name)[1].lower()
        media_type = (
            'video'
            if (file.content_type or '').startswith('video') or ext in video_exts
            else 'photo'
        )

        if media_type == 'photo':
            story = Story.objects.create(
                author=request.user,
                media_type=media_type,
                image=downscale_image(file, 1600) or file,
                caption=caption,
            )
        else:
            story = Story.objects.create(
                author=request.user,
                media_type=media_type,
                video=file,
                caption=caption,
            )

        # Если запрос пришел через JavaScript (Fetch) — отдаем чистый JSON
        if is_ajax:
            return JsonResponse({
                'id': story.id,
                'media_url': story.image.url if story.image else story.video.url,
            })
        
        # Если стандартная HTML-форма — перенаправляем обратно на главную ленту
        return redirect('feed')

    # При GET-запросе возвращаем на feed (так как отдельного шаблона upload.html тоже нет)
    return redirect('feed')


@login_required
def api_active_stories(request):
    """JSON-список активных историй для JS-просмотрщика."""
    cutoff = timezone.now() - timezone.timedelta(hours=24)
    stories = Story.objects.filter(
        created_at__gte=cutoff
    ).select_related('author').order_by('author', 'created_at')

    grouped = {}
    for s in stories:
        uid = s.author.id
        if uid not in grouped:
            grouped[uid] = {
                'author_id': uid,
                'author_name': s.author.username,
                'author_avatar': (
                    s.author.profile.avatar.url
                    if s.author.profile.avatar else None
                ),
                'items': [],
            }
        grouped[uid]['items'].append({
            'id': s.id,
            'type': s.media_type,
            'url': s.image.url if s.image else s.video.url,
            'caption': s.caption,
        })

    return JsonResponse({'stories': list(grouped.values())})


@login_required
def delete_story(request, story_id):
    """Удаление своей истории (AJAX + HTML)."""
    if request.method == 'POST':
        story = get_object_or_404(Story, id=story_id, author=request.user)

        for field in (story.image, story.video):
            if field:
                try:
                    field.delete(save=False)
                except OSError:
                    pass

        story_id_ = story.id
        story.delete()

        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return JsonResponse({'deleted': True, 'id': story_id_})
        return redirect('feed')

    return redirect('feed')
