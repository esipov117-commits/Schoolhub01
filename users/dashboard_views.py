"""Views for the configurable SchoolHub Mission Control dashboard."""

from datetime import datetime, timezone as dt_timezone
from email.utils import parsedate_to_datetime
import xml.etree.ElementTree as ET
from urllib.error import URLError, HTTPError
from urllib.request import Request, urlopen

from django.contrib.auth.decorators import login_required
from django.core.cache import cache
from django.http import JsonResponse
from django.shortcuts import render
from django.utils import timezone
from django.views.decorators.http import require_GET

from events.models import Event
from posts.models import Post
from tasks.models import TodoTask


NEWS_CACHE_KEY = "schoolhub:dashboard-news:v1"
NEWS_CACHE_SECONDS = 10 * 60

NEWS_FEEDS = (
    (
        "Space",
        "https://news.google.com/rss/search?q=SpaceX+OR+NASA+OR+rocket+OR+space+exploration&hl=en-US&gl=US&ceid=US:en",
    ),
    (
        "Technology",
        "https://news.google.com/rss/search?q=Apple+OR+technology+OR+artificial+intelligence&hl=en-US&gl=US&ceid=US:en",
    ),
    (
        "Business",
        "https://news.google.com/rss/search?q=technology+business+OR+stock+market&hl=en-US&gl=US&ceid=US:en",
    ),
)


def _completed_status_values():
    """Detect common completed values from TodoTask.status choices."""
    try:
        choices = TodoTask._meta.get_field("status").choices
    except Exception:
        choices = ()

    completed_markers = (
        "complete",
        "completed",
        "done",
        "finished",
        "выполн",
        "готов",
    )

    values = []

    for value, label in choices:
        text = f"{value} {label}".lower()

        if any(marker in text for marker in completed_markers):
            values.append(value)

    return values or [
        "completed",
        "complete",
        "done",
        "finished",
        "COMPLETED",
        "DONE",
    ]


@login_required
def mission_dashboard(request):
    """Render the dashboard without replacing users.views."""
    today = timezone.localdate()

    tasks = TodoTask.objects.filter(user=request.user)
    completed_values = _completed_status_values()

    completed_tasks_count = tasks.filter(
        status__in=completed_values
    ).count()

    open_tasks = tasks.exclude(
        status__in=completed_values
    )

    try:
        today_tasks = open_tasks.order_by("due_date", "id")[:5]
    except Exception:
        today_tasks = open_tasks.order_by("id")[:5]

    events_queryset = Event.objects.filter(
        date__gte=today
    ).order_by("date", "time")

    upcoming_events_count = events_queryset.count()
    events = events_queryset[:5]

    # Пытаемся получить город из профиля пользователя.
    # Если такого поля нет, используем Томск.
    weather_default_city = ""

    try:
        weather_default_city = (
            getattr(request.user.profile, "city", "") or ""
        )
    except Exception:
        pass

    stats = {
        "posts_count": Post.objects.filter(
            author=request.user
        ).count(),
        "friends_count": 0,
        "groups_count": 0,
    }

    context = {
        "today_tasks": today_tasks,
        "events": events,
        "open_tasks_count": open_tasks.count(),
        "completed_tasks_count": completed_tasks_count,
        "upcoming_events_count": upcoming_events_count,
        "weather_default_city": weather_default_city or "Tomsk",
        "stats": stats,
    }

    return render(request, "home.html", context)


def _parse_rss_feed(category, url):
    """Read a fixed RSS URL and return normalized news items."""

    req = Request(
        url,
        headers={
            "User-Agent": (
                "SchoolHub-MissionControl/1.0 (+Django RSS reader)"
            ),
            "Accept": (
                "application/rss+xml, application/xml, text/xml"
            ),
        },
    )

    with urlopen(req, timeout=6) as response:
        payload = response.read(2_000_000)

    root = ET.fromstring(payload)
    channel = root.find("channel")

    if channel is None:
        return []

    items = []

    for entry in channel.findall("item")[:8]:
        title = (entry.findtext("title") or "").strip()
        link = (entry.findtext("link") or "").strip()
        published_raw = (entry.findtext("pubDate") or "").strip()

        source_node = entry.find("source")

        source = (
            (source_node.text or "").strip()
            if source_node is not None
            else category
        )

        published_at = None

        if published_raw:
            try:
                parsed = parsedate_to_datetime(published_raw)

                if parsed.tzinfo is None:
                    parsed = parsed.replace(
                        tzinfo=dt_timezone.utc
                    )

                published_at = parsed.astimezone(
                    dt_timezone.utc
                ).isoformat()

            except (TypeError, ValueError, OverflowError):
                published_at = None

        if title and link and link.startswith(("https://", "http://")):
            items.append({
                "title": title,
                "url": link,
                "source": source or category,
                "category": category,
                "published_at": published_at,
            })

    return items


@login_required
@require_GET
def dashboard_news(request):
    """Cached RSS aggregation endpoint for the JavaScript widget."""

    cached = cache.get(NEWS_CACHE_KEY)

    if cached is not None:
        return JsonResponse({
            "items": cached,
            "cached": True,
        })

    items = []
    errors = 0

    for category, url in NEWS_FEEDS:
        try:
            items.extend(_parse_rss_feed(category, url))

        except (
            URLError,
            HTTPError,
            TimeoutError,
            ET.ParseError,
            OSError,
            ValueError,
        ):
            errors += 1

    def sort_key(item):
        try:
            parsed = datetime.fromisoformat(
                item["published_at"].replace("Z", "+00:00")
            )
            return parsed.timestamp()

        except (TypeError, ValueError, AttributeError):
            return 0

    deduplicated = {}

    for item in sorted(items, key=sort_key, reverse=True):
        deduplicated.setdefault(item["url"], item)

    result = list(deduplicated.values())[:10]

    if result:
        cache.set(
            NEWS_CACHE_KEY,
            result,
            NEWS_CACHE_SECONDS,
        )

        return JsonResponse({
            "items": result,
            "cached": False,
        })

    return JsonResponse({
        "items": [],
        "error": (
            "Не удалось получить RSS-новости. "
            "Проверьте сетевой доступ сервера и попробуйте позже."
        ),
        "sources_failed": errors,
    }, status=502)