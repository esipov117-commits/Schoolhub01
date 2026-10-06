class StoryViewer {
    constructor() {
        this.stories = []; 
        this.currentStoryIndex = -1;
        this.currentItemIndex = -1; 
        this.timer = null;
        
        // Поиск элементов DOM
        this.viewer = document.getElementById('story-viewer');
        this.mediaContainer = document.getElementById('viewer-media-content');
        this.progressBarContainer = document.querySelector('.story-progress-bar');
        this.authorNameEl = document.getElementById('viewer-author');
        this.authorAvatarEl = document.getElementById('viewer-avatar');
        this.captionEl = document.getElementById('viewer-caption');
        
        // Кнопка закрытия
        this.closeBtn = document.querySelector('.story-close');
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.close());
        }

        this.setupTapZones();
    }

    async loadStories() {
        try {
            const response = await fetch('/stories/api/active/');
            if (!response.ok) throw new Error('Network error');
            const data = await response.json();
            
            this.stories = data.stories; 
            this.renderStoriesBar();
        } catch (error) {
            console.error('Ошибка загрузки историй:', error);
        }
    }

    renderStoriesBar() {
        const bar = document.querySelector('.stories-bar');
        if (!bar) return;

        const addBtn = bar.querySelector('.story-add');
        bar.innerHTML = '';
        if (addBtn) bar.appendChild(addBtn);

        this.stories.forEach((authorGroup) => {
            if (authorGroup.items.length === 0) return;

            const item = document.createElement('div');
            item.className = 'story-item';
            item.dataset.authorId = authorGroup.author_id;

            const avatarUrl = authorGroup.author_avatar || '/static/img/default-avatar.png';
            const name = authorGroup.author_name || 'User';

            item.innerHTML = `
                <div class="story-avatar has-story">
                    <img src="${avatarUrl}" alt="${name}">
                </div>
                <span class="story-label">${name}</span>
            `;
            
            item.addEventListener('click', () => this.openForAuthor(authorGroup.author_id));
            bar.appendChild(item);
        });
    }

    setupTapZones() {
        if (!this.viewer) return;

        // Создаем интерактивные зоны клика поверх медиа
        const leftZone = document.createElement('div');
        leftZone.className = 'story-tap-left';
        leftZone.addEventListener('click', (e) => { e.stopPropagation(); this.prev(); });

        const rightZone = document.createElement('div');
        rightZone.className = 'story-tap-right';
        rightZone.addEventListener('click', (e) => { e.stopPropagation(); this.next(); });

        this.viewer.querySelector('.story-viewer-media').appendChild(leftZone);
        this.viewer.querySelector('.story-viewer-media').appendChild(rightZone);
    }

    openForAuthor(authorId) {
        const authorGroup = this.stories.find(g => g.author_id === authorId);
        if (!authorGroup || authorGroup.items.length === 0) return;

        this.currentStoryIndex = this.stories.indexOf(authorGroup);
        this.currentItemIndex = 0;
        
        if (this.viewer) this.viewer.classList.add('open');
        this.updateViewerContent();
    }

    next() {
        const currentAuthorGroup = this.stories[this.currentStoryIndex];
        if (!currentAuthorGroup) return this.close();
        
        if (this.currentItemIndex < currentAuthorGroup.items.length - 1) {
            this.currentItemIndex++;
            this.updateViewerContent();
        } else {
            if (this.currentStoryIndex < this.stories.length - 1) {
                this.currentStoryIndex++;
                this.currentItemIndex = 0;
                this.updateViewerContent();
            } else {
                this.close();
            }
        }
    }

    prev() {
        if (this.currentItemIndex > 0) {
            this.currentItemIndex--;
            this.updateViewerContent();
        } else if (this.currentStoryIndex > 0) {
            this.currentStoryIndex--;
            const prevGroup = this.stories[this.currentStoryIndex];
            this.currentItemIndex = prevGroup.items.length - 1;
            this.updateViewerContent();
        }
    }

    updateViewerContent() {
        const group = this.stories[this.currentStoryIndex];
        const item = group.items[this.currentItemIndex];

        this.authorNameEl.textContent = group.author_name;
        this.authorAvatarEl.src = group.author_avatar || '/static/img/default-avatar.png';
        this.captionEl.textContent = item.caption || '';

        this.mediaContainer.innerHTML = '';
        const mediaEl = item.type === 'video' ? document.createElement('video') : document.createElement('img');
        mediaEl.src = item.url;
        mediaEl.className = 'viewer-actual-media';
        
        if (item.type === 'video') {
            mediaEl.controls = false;
            mediaEl.playsInline = true;
            mediaEl.muted = false;
            mediaEl.autoplay = true;
        }

        this.mediaContainer.appendChild(mediaEl);
        this.renderProgressBar();
        this.startTimer();
    }

    renderProgressBar() {
        if (!this.progressBarContainer) return;
        this.progressBarContainer.innerHTML = '';
        
        const group = this.stories[this.currentStoryIndex];
        group.items.forEach((_, idx) => {
            const seg = document.createElement('div');
            seg.className = 'seg';
            if (idx < this.currentItemIndex) seg.classList.add('done');
            
            seg.innerHTML = '<div class="fill"></div>';
            this.progressBarContainer.appendChild(seg);
        });

        // Небольшой хак для принудительного перезапуска CSS триггера анимации полоски
        setTimeout(() => {
            const activeSeg = this.progressBarContainer.children[this.currentItemIndex];
            if (activeSeg) activeSeg.classList.add('active');
        }, 20);
    }

    startTimer() {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.next(), 5000); // История длится 5 секунд
    }

    close() {
        clearTimeout(this.timer);
        if (this.mediaContainer) this.mediaContainer.innerHTML = '';
        if (this.viewer) this.viewer.classList.remove('open');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.storyViewer = new StoryViewer();
    window.storyViewer.loadStories();

    // Автоматическая AJAX загрузка истории
    const uploadForm = document.getElementById('storyUploadForm');
    const fileInput = document.getElementById('story-file-input');

    if (uploadForm && fileInput) {
        fileInput.addEventListener('change', async () => {
            if (!fileInput.files.length) return;

            const formData = new FormData(uploadForm);
            const csrftoken = document.querySelector('[name=csrfmiddlewaretoken]')?.value;

            try {
                const res = await fetch(uploadForm.action, {
                    method: 'POST',
                    body: formData,
                    headers: {
                        'X-CSRFToken': csrftoken,
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                });

                if (res.ok) {
                    uploadForm.reset();
                    if (window.storyViewer) {
                        await window.storyViewer.loadStories(); // Перерендеринг бара
                    }
                } else {
                    const err = await res.json();
                    alert('Ошибка: ' + (err.error || 'Не удалось загрузить'));
                }
            } catch (error) {
                console.error('Ошибка сети:', error);
            }
        });

        uploadForm.addEventListener('submit', (e) => e.preventDefault());
    }
});
