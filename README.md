# SchoolHub

Школьная соцсеть на Django: лента постов, сторис на 24 часа, личные чаты
со сквозным шифрованием, события, календарь-планировщик, задачи и профили
с подписками. Классический server-render (Django MVT) + AJAX-островки
на ванильном JS, без DRF и фронтенд-фреймворков.

## Что нужно

- Python 3.13+
- PostgreSQL 14+ (запущенный сервер)
- Git

Зависимости Python — в `requirements.txt`:
Django, psycopg2-binary, Pillow, WhiteNoise, cryptography, python-decouple.

## Быстрый запуск

```bash
# 1. Клонировать и зайти в проект
git clone <repo-url> && cd Schoolhub01

# 2. Виртуальное окружение и зависимости
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt

# 3. База данных (создать пустую БД, пример для psql)
createdb schoolhub
# или: psql -c "CREATE DATABASE schoolhub;"

# 4. Переменные окружения — создать файл .env в корне:
cat > .env <<'EOF'
SECRET_KEY=замени-на-случайную-строку
DEBUG=True
DB_NAME=schoolhub
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=localhost
DB_PORT=5432
EOF

# Мастер-ключ для шифрования чата (по желанию, иначе выводится из SECRET_KEY):
# .venv/bin/python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# CHAT_MASTER_KEY=...

# 5. Миграции и суперпользователь
.venv/bin/python manage.py migrate
.venv/bin/python manage.py createsuperuser

# 6. Запуск
.venv/bin/python manage.py runserver
```

Открыть: http://127.0.0.1:8000/ (админка — `/admin/`).

## Переменные окружения (.env)

| Переменная | Обязательна | По умолчанию | Назначение |
|---|---|---|---|
| `SECRET_KEY` | да | — | Секретный ключ Django |
| `DEBUG` | нет | `False` | `True` только для локальной разработки |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD` | да | — | Подключение к PostgreSQL |
| `DB_HOST`, `DB_PORT` | нет | `localhost`, `5432` | Хост/порт БД |
| `CHAT_MASTER_KEY` | нет | вывод из `SECRET_KEY` | Мастер-ключ шифрования чата (Fernet) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | для push | — | Ключи Web Push (генерирует `manage.py webpush_vapid`) |
| `VAPID_ADMIN_EMAIL` | нет | `mailto:admin@example.com` | Контакт в VAPID-подписи; для продакшена указать реальный |
| `COOKIE_SECURE`, `SECURE_SSL_REDIRECT` | нет | `not DEBUG` | Принудительный HTTPS в проде |
| `TRUST_PROXY`, `USE_X_FORWARDED_HOST` | нет | `True`, `False` | Работа за nginx/прокси с TLS |

## Структура проекта

```
config/     — настройки, корневой urls, wsgi/asgi
locale/     — переводы интерфейса (gettext .po/.mo, язык en)
users/      — регистрация/логин, профили, подписки, настройки темы
posts/      — лента, лайки, комментарии (render + JSON для AJAX)
chat/       — диалоги, шифрование (crypto.py), опрос новых сообщений
events/     — школьные события (только для организаторов)
stories/    — фото/видео на 24 часа (+ команда cleanup_stories)
tasks/      — личные задачи (живут на главной)
planner/    — календарь событий (templates/calendar.html в корне)
templates/  — base.html, welcome.html + папки приложений
static/js/  — feed.js, main.js (infinite scroll, лайки, сторис, чат)
webpush/    — PWA-манифест, service worker, Web Push (VAPID) и подписки
```

## Полезные команды

```bash
.venv/bin/python manage.py check              # проверка конфигурации
.venv/bin/python manage.py makemigrations     # создать миграции после смены моделей
.venv/bin/python manage.py migrate            # применить миграции
.venv/bin/python manage.py test               # тесты
.venv/bin/python manage.py collectstatic      # сбор статики для продакшена
.venv/bin/python manage.py cleanup_stories    # удалить просроченные сторис
.venv/bin/python manage.py webpush_vapid      # сгенерировать VAPID-ключи для push
.venv/bin/python manage.py makemessages -l en # собрать строки для перевода
.venv/bin/python manage.py compilemessages    # скомпилировать .po → .mo
```

## Язык интерфейса

Язык хранится в `Profile.language` (`ru` по умолчанию, `en`), применяется
через `users.middleware.LanguageMiddleware` (после `LocaleMiddleware`).
Переключение — в «Настройках» → «Язык»; выбор сразу сохраняется и перезагружает
страницу (эндпоинт `set_language`, JSON). Строки интерфейса оборачиваются в
`{% trans %}`/`{% blocktrans %}`, переводы — в `locale/<код>/LC_MESSAGES/`.

Чтобы добавить новый язык: внести код в `LANGUAGES` (`config/settings.py`),
добавить вариант в `Profile.language`, затем
`makemessages -l <код>` → перевести `locale/<код>/LC_MESSAGES/django.po` →
`compilemessages`.

## Уведомления как в приложении (PWA / Web Push)

Проект устанавливается на телефон как PWA и шлёт push-уведомления о новых
сообщениях чата — даже когда вкладка закрыта.

Как это работает:

- `/manifest.webmanifest` и `/sw.js` (service worker со scope `/`) отдаёт
  приложение `webpush/`; на iPhone сайт добавляется на экран «Домой» и
  открывается без адресной строки;
- подписки устройств хранятся в модели `PushSubscription` (админка `/admin/`);
- при отправке сообщения `chat.views.send_message` вызывает
  `webpush.push.notify_new_message`, который в фоновом потоке рассылает push
  через `pywebpush` с VAPID-подписью.

Требования: **HTTPS** (push API не работает по http, кроме `localhost`) и
VAPID-ключи в `.env`:

```bash
.venv/bin/python manage.py webpush_vapid   # выведет строки для .env
```

Пользователь включает уведомления в «Настройках» → «Уведомления на телефон»
или в меню профиля. Ограничения Apple: на iOS уведомления приходят только
после добавления сайта на экран «Домой» (iOS 16.4+); при первом запуске
на iPhone показывается подсказка, как это сделать.

## Продакшен-заметки

- `DEBUG` оставить `False`; задать `COOKIE_SECURE=True`,
  `SECURE_SSL_REDIRECT=True` (нужен HTTPS через nginx).
- `ALLOWED_HOSTS` / `CSRF_TRUSTED_ORIGINS` в `config/settings.py`
  сейчас заточены под конкретный IP — поменять под свой домен.
- Статика отдаётся через WhiteNoise (`collectstatic` → `staticfiles/`),
  медиа — из `media/` (каталог в git не коммитится).
