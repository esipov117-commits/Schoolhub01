from django import template
from django.utils import timezone
from django.utils.translation import get_language
from django.utils.translation import gettext as _

register = template.Library()


def _plural_form(n, one, few, many):
    n10 = n % 10
    n100 = n % 100
    if n10 == 1 and n100 != 11:
        return one
    if 2 <= n10 <= 4 and not 12 <= n100 <= 14:
        return few
    return many


def _counted(n, one, few, many):
    if get_language() == 'ru':
        return _plural_form(n, one, few, many)
    return one if n == 1 else many


@register.filter
def plural_ru(value, forms):
    one, few, many = [f.strip() for f in forms.split(',')]
    return _plural_form(int(value), one, few, many)


@register.filter
def likes_text(value):
    n = int(value)
    word = _counted(n, _('отметка'), _('отметки'), _('отметок'))
    return f'{n} {word} «{_("Нравится")}»'


@register.filter
def comments_text(value):
    n = int(value)
    word = _counted(n, _('комментарий'), _('комментария'), _('комментариев'))
    return f'{n} {word}'


@register.filter
def views_text(value):
    n = int(value)
    word = _counted(n, _('просмотр'), _('просмотра'), _('просмотров'))
    return f'{n} {word}'


@register.filter
def fulldate(value):
    if not value:
        return ''
    return value.strftime('%d.%m.%Y, %H:%M')


@register.filter
def timeago(value):
    if not value:
        return ''
    diff = timezone.now() - value
    seconds = int(diff.total_seconds())
    if seconds < 60:
        return _('только что')
    minutes = seconds // 60
    if minutes < 60:
        return _('%(n)s мин.') % {'n': minutes}
    hours = minutes // 60
    if hours < 24:
        return _('%(n)s ч.') % {'n': hours}
    days = hours // 24
    if days < 7:
        return _('%(n)s дн.') % {'n': days}
    return value.strftime('%d.%m.%Y')
