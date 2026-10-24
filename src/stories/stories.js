class StoryViewer {
    constructor() {
        this.stories = [];
        this.currentStoryIndex = -1;
        this.currentItemIndex = -1;
        this.timer = null;

        this.viewer = document.getElementById('story-viewer');
        this.mediaContainer = document.getElementById('viewer-media-content');
        this.progressBarContainer = document.querySelector('.story-progress-bar');
        this.authorNameEl = document.getElementById('viewer-author');
        this.authorAvatarEl = document.getElementById('viewer-avatar');
        this.captionEl = document.getElementById('viewer-caption');

        this.closeBtn = document.querySelector('.story-close');

        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.close());
        }

        this.setupTapZones();
    }

    // Получение CSRF-токена
    getCsrfToken() {
        const csrfInput = document.querySelector(
            '[name="csrfmiddlewaretoken"]'
        );

        if (csrfInput) {
            return csrfInput.value;
        }

        // На случай, если Django хранит токен в cookie
        const cookie = document.cookie
            .split('; ')
            .find(row => row.startsWith('csrftoken='));

        if (cookie) {
            return decodeURIComponent(cookie.split('=')[1]);
        }

        return null;
    }

    async loadStories() {
        try {
            const response = await fetch('/stories/api/active/', {
                method: 'GET',
                credentials: 'same-origin',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json'
                }
            });

            console.log(
                'Stories API:',
                response.status,
                response.url
            );

            // Пользователь не авторизован
            if (response.redirected || response.status === 302) {
                console.warn('Stories API redirected to login');
                this.stories = [];
                this.renderStoriesBar();
                return;
            }

            if (!response.ok) {
                const errorText = await response.text();

                console.error(
                    'Stories API error:',
                    response.status,
                    errorText
                );

                this.stories = [];
                this.renderStoriesBar();

                return;
            }

            const data = await response.json();

            console.log('Stories data:', data);

            this.stories = Array.isArray(data.stories)
                ? data.stories
                : [];

            this.renderStoriesBar();

        } catch (error) {
            console.error(
                'Ошибка загрузки историй:',
                error
            );
        }
    }

    renderStoriesBar() {
        const bar = document.querySelector('.stories-bar');

        if (!bar) {
            console.warn('Не найден .stories-bar');
            return;
        }

        const addBtn = bar.querySelector('.story-add');

        bar.innerHTML = '';

        if (addBtn) {
            bar.appendChild(addBtn);
        }

        this.stories.forEach((authorGroup) => {
            if (
                !authorGroup ||
                !Array.isArray(authorGroup.items) ||
                authorGroup.items.length === 0
            ) {
                return;
            }

            const item = document.createElement('div');

            item.className = 'story-item';
            item.dataset.authorId = authorGroup.author_id;

            const avatarUrl =
                authorGroup.author_avatar ||
                '/static/img/default-avatar.png';

            const name =
                authorGroup.author_name ||
                'User';

            item.innerHTML = `
                <div class="story-avatar has-story">
                    <img
                        src="${avatarUrl}"
                        alt="${name}"
                        loading="lazy"
                        decoding="async"
                    >
                </div>
                <span class="story-label">
                    ${name}
                </span>
            `;

            item.addEventListener('click', () => {
                this.openForAuthor(authorGroup.author_id);
            });

            bar.appendChild(item);
        });
    }

    setupTapZones() {
        if (!this.viewer) {
            return;
        }

        const media = this.viewer.querySelector(
            '.story-viewer-media'
        );

        if (!media) {
            console.warn(
                'Не найден .story-viewer-media'
            );
            return;
        }

        const leftZone = document.createElement('div');

        leftZone.className = 'story-tap-left';

        leftZone.addEventListener('click', (event) => {
            event.stopPropagation();
            this.prev();
        });

        const rightZone = document.createElement('div');

        rightZone.className = 'story-tap-right';

        rightZone.addEventListener('click', (event) => {
            event.stopPropagation();
            this.next();
        });

        media.appendChild(leftZone);
        media.appendChild(rightZone);
    }

    openForAuthor(authorId) {
        const authorGroup = this.stories.find(
            group =>
                String(group.author_id) === String(authorId)
        );

        if (
            !authorGroup ||
            !Array.isArray(authorGroup.items) ||
            authorGroup.items.length === 0
        ) {
            return;
        }

        this.currentStoryIndex =
            this.stories.indexOf(authorGroup);

        this.currentItemIndex = 0;

        if (this.viewer) {
            this.viewer.classList.add('open');
        }

        this.updateViewerContent();
    }

    next() {
        const currentAuthorGroup =
            this.stories[this.currentStoryIndex];

        if (!currentAuthorGroup) {
            this.close();
            return;
        }

        if (
            this.currentItemIndex <
            currentAuthorGroup.items.length - 1
        ) {
            this.currentItemIndex++;
            this.updateViewerContent();
            return;
        }

        if (
            this.currentStoryIndex <
            this.stories.length - 1
        ) {
            this.currentStoryIndex++;
            this.currentItemIndex = 0;
            this.updateViewerContent();
            return;
        }

        this.close();
    }

    prev() {
        if (this.currentItemIndex > 0) {
            this.currentItemIndex--;
            this.updateViewerContent();
            return;
        }

        if (this.currentStoryIndex > 0) {
            this.currentStoryIndex--;

            const previousGroup =
                this.stories[this.currentStoryIndex];

            if (
                previousGroup &&
                previousGroup.items &&
                previousGroup.items.length
            ) {
                this.currentItemIndex =
                    previousGroup.items.length - 1;

                this.updateViewerContent();
            }
        }
    }

    updateViewerContent() {
        const group =
            this.stories[this.currentStoryIndex];

        if (!group || !group.items) {
            return;
        }

        const item =
            group.items[this.currentItemIndex];

        if (!item) {
            return;
        }

        if (this.authorNameEl) {
            this.authorNameEl.textContent =
                group.author_name || 'User';
        }

        if (this.authorAvatarEl) {
            this.authorAvatarEl.src =
                group.author_avatar ||
                '/static/img/default-avatar.png';
        }

        if (this.captionEl) {
            this.captionEl.textContent =
                item.caption || '';
        }

        if (!this.mediaContainer) {
            return;
        }

        this.mediaContainer.innerHTML = '';

        let mediaEl;

        if (item.type === 'video') {
            mediaEl = document.createElement('video');

            mediaEl.controls = false;
            mediaEl.playsInline = true;
            mediaEl.autoplay = true;
            mediaEl.muted = false;

        } else {
            mediaEl = document.createElement('img');
        }

        mediaEl.src = item.url;
        mediaEl.className =
            'viewer-actual-media';

        mediaEl.onerror = () => {
            console.error(
                'Не удалось загрузить media:',
                item.url
            );
        };

        this.mediaContainer.appendChild(mediaEl);

        if (item.type === 'video') {
            mediaEl.play().catch(() => {
                console.log(
                    'Автовоспроизведение видео заблокировано браузером'
                );
            });
        }

        this.renderProgressBar();
        this.startTimer();
    }

    renderProgressBar() {
        if (!this.progressBarContainer) {
            return;
        }

        this.progressBarContainer.innerHTML = '';

        const group =
            this.stories[this.currentStoryIndex];

        if (!group || !group.items) {
            return;
        }

        group.items.forEach((_, index) => {
            const segment =
                document.createElement('div');

            segment.className = 'seg';

            if (
                index <
                this.currentItemIndex
            ) {
                segment.classList.add('done');
            }

            segment.innerHTML =
                '<div class="fill"></div>';

            this.progressBarContainer.appendChild(
                segment
            );
        });

        setTimeout(() => {
            const activeSegment =
                this.progressBarContainer.children[
                    this.currentItemIndex
                ];

            if (activeSegment) {
                activeSegment.classList.add(
                    'active'
                );
            }
        }, 20);
    }

    startTimer() {
        clearTimeout(this.timer);

        this.timer = setTimeout(() => {
            this.next();
        }, 5000);
    }

    close() {
        clearTimeout(this.timer);

        this.timer = null;

        if (this.mediaContainer) {
            this.mediaContainer.innerHTML = '';
        }

        if (this.viewer) {
            this.viewer.classList.remove('open');
        }

        this.currentStoryIndex = -1;
        this.currentItemIndex = -1;
    }
}


// =====================================================
// ИНИЦИАЛИЗАЦИЯ
// =====================================================

document.addEventListener('DOMContentLoaded', () => {

    window.storyViewer = new StoryViewer();

    window.storyViewer.loadStories();


    // =================================================
    // ЗАГРУЗКА ИСТОРИИ
    // =================================================

    const uploadForm =
        document.getElementById('storyUploadForm');

    const fileInput =
        document.getElementById('story-file-input');

    if (!uploadForm || !fileInput) {
        console.log(
            'Форма загрузки историй не найдена'
        );

        return;
    }

    fileInput.addEventListener(
        'change',
        async () => {

            if (!fileInput.files.length) {
                return;
            }

            const formData =
                new FormData(uploadForm);

            const csrfToken =
                window.storyViewer.getCsrfToken();

            if (!csrfToken) {
                console.error(
                    'CSRF token не найден'
                );

                alert(
                    'Не удалось получить CSRF-токен. Обновите страницу.'
                );

                return;
            }

            try {

                const response =
                    await fetch(
                        uploadForm.action,
                        {
                            method: 'POST',

                            credentials:
                                'same-origin',

                            body: formData,

                            headers: {
                                'X-CSRFToken':
                                    csrfToken,

                                'X-Requested-With':
                                    'XMLHttpRequest',

                                'Accept':
                                    'application/json'
                            }
                        }
                    );

                console.log(
                    'Upload story:',
                    response.status,
                    response.url
                );

                if (
                    response.redirected &&
                    response.url.includes(
                        '/accounts/login/'
                    )
                ) {
                    alert(
                        'Ваша сессия закончилась. Войдите в аккаунт снова.'
                    );

                    return;
                }

                const contentType =
                    response.headers.get(
                        'content-type'
                    ) || '';

                let data = null;

                if (
                    contentType.includes(
                        'application/json'
                    )
                ) {
                    data =
                        await response.json();
                } else {
                    const text =
                        await response.text();

                    console.error(
                        'Сервер вернул не JSON:',
                        text
                    );
                }

                if (!response.ok) {

                    alert(
                        'Ошибка: ' +
                        (
                            data?.error ||
                            `HTTP ${response.status}`
                        )
                    );

                    return;
                }

                uploadForm.reset();

                await window.storyViewer
                    .loadStories();

            } catch (error) {

                console.error(
                    'Ошибка загрузки истории:',
                    error
                );

                alert(
                    'Ошибка соединения с сервером.'
                );
            }
        }
    );


    // Не даём форме перезагружать страницу
    uploadForm.addEventListener(
        'submit',
        (event) => {
            event.preventDefault();
        }
    );
});