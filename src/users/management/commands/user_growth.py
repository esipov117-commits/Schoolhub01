"""Консольная утилита: прирост пользователей по дням/часам/шагу.

Примеры:
    python manage.py user_growth                    # по дням за последние 30 дней
    python manage.py user_growth --step 6h          # каждые 6 часов
    python manage.py user_growth --step 30m --range 24h
    python manage.py user_growth --range 7d --step 1d
"""

import re
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

STEP_PATTERN = re.compile(r"^(\d+)(s|m|h|d)$")


def parse_delta(value, name):
    """Разбирает строку вида '30d', '12h', '45m', '90s' в timedelta."""
    match = STEP_PATTERN.match(str(value).strip().lower())
    if not match:
        raise CommandError(
            f"Некорректное значение {name!r}: {value!r}. "
            "Ожидается формат вида 30d, 12h, 45m или 90s."
        )
    amount = int(match.group(1))
    unit = match.group(2)
    if unit == "s":
        return timedelta(seconds=amount)
    if unit == "m":
        return timedelta(minutes=amount)
    if unit == "h":
        return timedelta(hours=amount)
    return timedelta(days=amount)


def fmt_dt(value, step):
    """Формат метки начала шага для вывода."""
    local = timezone.localtime(value)
    step_seconds = step.total_seconds()
    if step_seconds >= 86400:
        return local.strftime("%Y-%m-%d")
    if step_seconds >= 3600:
        return local.strftime("%Y-%m-%d %H:00")
    return local.strftime("%Y-%m-%d %H:%M")


class Command(BaseCommand):
    help = "Показывает прирост пользователей по дням/часам с выбираемым шагом."

    def add_arguments(self, parser):
        parser.add_argument(
            "--step",
            default="1d",
            help="Шаг агрегации: 30d, 12h, 45m, 90s (по умолчанию 1d).",
        )
        parser.add_argument(
            "--range",
            default="30d",
            help="Период от текущего момента в прошлое: 30d, 48h, 12h (по умолчанию 30d).",
        )

    def handle(self, *args, **options):
        step = parse_delta(options["step"], "--step")
        span = parse_delta(options["range"], "--range")

        if step.total_seconds() <= 0 or span.total_seconds() <= 0:
            raise CommandError("Шаг и период должны быть положительными.")

        User = get_user_model()
        now = timezone.now()
        start = now - span

        users = (
            User.objects.filter(date_joined__gte=start)
            .order_by("date_joined")
            .values_list("date_joined", flat=True)
        )

        # Разбивка на «корзины» по шагу.
        buckets = {}
        step_seconds = step.total_seconds()
        for joined in users:
            index = int((joined - start).total_seconds() // step_seconds)
            buckets[index] = buckets.get(index, 0) + 1

        rows = []
        index = 0
        while start + timedelta(seconds=index * step_seconds) <= now:
            label = fmt_dt(start + timedelta(seconds=index * step_seconds), step)
            rows.append((label, buckets.get(index, 0)))
            index += 1

        total = sum(count for _, count in rows)
        max_count = max((count for _, count in rows), default=0)
        bar_width = 30

        def bar(count):
            if max_count == 0:
                return ""
            filled = round(count / max_count * bar_width)
            return "#" * filled

        self.stdout.write(
            f"Прирост пользователей за последние {options['range']}, шаг {options['step']}"
        )
        self.stdout.write("-" * 60)
        for label, count in rows:
            self.stdout.write(f"{label}  ->  {count:<5} {bar(count)}")
        self.stdout.write("-" * 60)
        self.stdout.write(self.style.SUCCESS(f"Итого новых: {total}"))