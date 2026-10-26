from django.conf import settings
from django.test.runner import DiscoverRunner


class SrcLayoutDiscoverRunner(DiscoverRunner):
    """Ищет тесты в src/, а не в корне репо.

    При src-layout unittest-discovery не заходит в src/, потому что у него
    нет __init__.py (не пакет). Без меток запускаем дискавери от BASE_DIR
    (= src/), чтобы нашлись users.tests, posts.tests и т.д.
    """

    def build_suite(self, test_labels=None, **kwargs):
        if not test_labels:
            test_labels = [str(settings.BASE_DIR)]
        return super().build_suite(test_labels, **kwargs)
