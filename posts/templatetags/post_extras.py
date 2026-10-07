from django import template
from django.utils import timezone

register = template.Library()


def _plural(n, one, few, many):
    n10 = n % 10
    n100 = n % 100
    if n10 == 1 and n100 != 11:
        return one
    if 2 <= n10 <= 4 and not 12 <= n100 <= 14:
        return few
    return many


@register.filter
def plural_ru(value, forms):
    one, few, many = [f.strip() for f in forms.split(',')]
    return _plural(int(value), one, few, many)


@register.filter
def likes_text(value):
    n = int(value)
    return f'{n} {_plural(n, "отметка", "отметки", "отметок")} «Нравится»'


@register.filter
def comments_text(value):
    n = int(value)
    return f'{n} {_plural(n, "комментарий", "комментария", "комментариев")}'


@register.filter
def timeago(value):
    if not value:
        return ''
    diff = timezone.now() - value
    seconds = int(diff.total_seconds())
    if seconds < 60:
        return 'только что'
    minutes = seconds // 60
    if minutes < 60:
        return f'{minutes} мин.'
    hours = minutes // 60
    if hours < 24:
        return f'{hours} ч.'
    days = hours // 24
    if days < 7:
        return f'{days} дн.'
    return value.strftime('%d.%m.%Y')
