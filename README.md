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

# Почта для подтверждения регистрации (Gmail — пароль приложения, Yandex — пароль приложения):
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=you@gmail.com
EMAIL_HOST_PASSWORD=xxxx-xxxx-xxxx-xxxx
DEFAULT_FROM_EMAIL=you@gmail.com
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
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USE_TLS` | нет | `smtp.gmail.com`, `587`, `True` | SMTP для писем подтверждения |
| `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` | нет | — | Логин/пароль SMTP (для Gmail — пароль приложения) |
| `DEFAULT_FROM_EMAIL` | нет | = `EMAIL_HOST_USER` | Адрес отправителя |
| `EMAIL_RESEND_COOLDOWN` | нет | `60` | Пауза (сек) между повторными письмами |
| `CHAT_MASTER_KEY` | нет | вывод из `SECRET_KEY` | Мастер-ключ шифрования чата (Fernet) |
| `COOKIE_SECURE`, `SECURE_SSL_REDIRECT` | нет | `not DEBUG` | Принудительный HTTPS в проде |
| `TRUST_PROXY`, `USE_X_FORWARDED_HOST` | нет | `True`, `False` | Работа за nginx/прокси с TLS |

## Структура проекта

```
config/     — настройки, корневой urls, wsgi/asgi
users/      — регистрация/логин, профили, подписки, настройки темы
posts/      — лента, лайки, комментарии (render + JSON для AJAX)
chat/       — диалоги, шифрование (crypto.py), опрос новых сообщений
events/     — школьные события (только для организаторов)
stories/    — фото/видео на 24 часа (+ команда cleanup_stories)
tasks/      — личные задачи (живут на главной)
planner/    — календарь событий (templates/calendar.html в корне)
templates/  — base.html, home.html, welcome.html + папки приложений
static/js/  — feed.js, main.js (infinite scroll, лайки, сторис, чат)
```

## Регистрация и подтверждение почты

При регистрации (`/register/`) пользователь указывает `username`, `email` и пароль.
Аккаунт создаётся неактивным: на почту уходит ссылка `/activate/<uidb64>/<token>/`.
Войти можно только после перехода по ссылке.

- Страница «Проверьте почту» — `/activation-sent/`, там же повторная отправка.
- Вход по `username` и паролю (`/accounts/login/`).
- Для **существующих** пользователей (мягкий гейт): аккаунт остаётся рабочим, но
  в шапке сайта показывается баннер «Подтвердите почту» со ссылкой на `/verify-email/`,
  где можно указать/изменить адрес и получить ссылку подтверждения.
- Повторная отправка ограничена `EMAIL_RESEND_COOLDOWN` секундами.

## Полезные команды

```bash
.venv/bin/python manage.py check              # проверка конфигурации
.venv/bin/python manage.py makemigrations     # создать миграции после смены моделей
.venv/bin/python manage.py migrate            # применить миграции
.venv/bin/python manage.py test               # тесты
.venv/bin/python manage.py collectstatic      # сбор статики для продакшена
.venv/bin/python manage.py cleanup_stories    # удалить просроченные сторис
```

## Продакшен-заметки

- `DEBUG` оставить `False`; задать `COOKIE_SECURE=True`,
  `SECURE_SSL_REDIRECT=True` (нужен HTTPS через nginx).
- `ALLOWED_HOSTS` / `CSRF_TRUSTED_ORIGINS` в `config/settings.py`
  сейчас заточены под конкретный IP — поменять под свой домен.
- Статика отдаётся через WhiteNoise (`collectstatic` → `staticfiles/`),
  медиа — из `media/` (каталог в git не коммитится).
