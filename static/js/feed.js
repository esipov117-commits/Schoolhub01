/* Лента SchoolHub: лайки, комментарии, истории, FAB-создание постов. */
(function () {
    'use strict';

    var CFG = window.FEED_CONFIG || {};

    function getCookie(name) {
        var m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
        return m ? decodeURIComponent(m.pop()) : '';
    }

    function csrfToken() {
        var el = document.querySelector('[name=csrfmiddlewaretoken]');
        return getCookie('csrftoken') || (el ? el.value : '');
    }

    function xhrHeaders(extra) {
        var h = { 'X-Requested-With': 'XMLHttpRequest' };
        if (csrfToken()) h['X-CSRFToken'] = csrfToken();
        if (extra) for (var k in extra) h[k] = extra[k];
        return h;
    }

    function friendlyHttpError(status) {
        if (status === 403) return 'Доступ запрещён — обновите страницу и попробуйте снова';
        if (status === 400) return 'Некорректный запрос';
        if (status === 404) return 'Страница не найдена';
        if (status === 413) return 'Файл слишком большой для сервера';
        if (status >= 500) return 'Ошибка сервера — попробуйте позже';
        return 'Не удалось отправить (код ' + status + ')';
    }

    function postForm(url, formData) {
        return fetch(url, {
            method: 'POST',
            credentials: 'same-origin',
            headers: xhrHeaders(),
            body: formData
        }).then(function (r) {
            var ct = r.headers.get('content-type') || '';
            if (ct.indexOf('application/json') !== -1) {
                return r.json().then(function (d) { return { ok: r.ok, data: d }; });
            }
            // Сервер ответил HTML (403 CSRF, 413 слишком большой файл, 500...)
            return { ok: false, data: { error: friendlyHttpError(r.status) } };
        });
    }

    function getJSON(url) {
        return fetch(url, { credentials: 'same-origin', headers: xhrHeaders() })
            .then(function (r) { return r.json(); });
    }

    var toastEl = null;
    function toast(msg) {
        if (!toastEl) {
            toastEl = document.createElement('div');
            toastEl.style.cssText =
                'position:fixed;left:50%;bottom:96px;transform:translateX(-50%);' +
                'background:#111;color:#fff;padding:10px 18px;border-radius:99px;' +
                'font-size:13.5px;z-index:10005;box-shadow:0 8px 24px rgba(0,0,0,.35);' +
                'opacity:0;transition:opacity .2s ease;pointer-events:none;max-width:80vw;';
            document.body.appendChild(toastEl);
        }
        toastEl.textContent = msg;
        toastEl.style.opacity = '1';
        clearTimeout(toastEl._t);
        toastEl._t = setTimeout(function () { toastEl.style.opacity = '0'; }, 2600);
    }

    function esc(s) {
        var d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function fmtDate(iso) {
        var d = new Date(iso);
        if (isNaN(d)) return '';
        var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
        return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() +
            ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }

    var LIKE_FILLED = '<svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor"><path d="M12 21s-.4-.3-1-.8C6.7 16.9 3 13.5 3 9.6 3 6.9 5.1 5 7.7 5c1.5 0 3 .7 3.9 1.9C12.5 5.7 14 5 15.5 5 18.1 5 20.2 6.9 20.2 9.6c0 3.9-3.7 7.3-8 10.6-.6.5-1 .8-1 .8z"/></svg>';
    var LIKE_OUTLINE = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 21s-.4-.3-1-.8C6.7 16.9 3 13.5 3 9.6 3 6.9 5.1 5 7.7 5c1.5 0 3 .7 3.9 1.9C12.5 5.7 14 5 15.5 5 18.1 5 20.2 6.9 20.2 9.6c0 3.9-3.7 7.3-8 10.6-.6.5-1 .8-1 .8z"/></svg>';
    var TRASH_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    var PENCIL_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
    var SEND_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h16M14 6l6 6-6 6"/></svg>';
    var BUBBLE_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
    var PLANE_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';
    var PLANE_SVG_SM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';

    /* ====================== Русские склонения и время ====================== */
    function pluralRu(n, one, few, many) {
        var n10 = n % 10, n100 = n % 100;
        if (n10 === 1 && n100 !== 11) return one;
        if (n10 >= 2 && n10 <= 4 && !(n100 >= 12 && n100 <= 14)) return few;
        return many;
    }

    function likesText(n) {
        n = n || 0;
        return n + ' ' + pluralRu(n, 'отметка', 'отметки', 'отметок') + ' «Нравится»';
    }

    function commentsText(n) {
        n = n || 0;
        return n + ' ' + pluralRu(n, 'комментарий', 'комментария', 'комментариев');
    }

    function updateCounts(card, likesN, commentsN) {
        if (!card) return;
        if (likesN != null) card.querySelectorAll('.likes-count').forEach(function (el) { el.textContent = likesText(likesN); });
        if (commentsN != null) card.querySelectorAll('.comments-count').forEach(function (el) { el.textContent = commentsText(commentsN); });
    }
    var SOUND_ON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4V5z"></path><path d="M15.5 8.5a5 5 0 0 1 0 7"></path><path d="M18.5 5.5a9 9 0 0 1 0 13"></path></svg>';
    var SOUND_OFF_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4V5z"></path><line x1="22" y1="9" x2="16" y2="15"></line><line x1="16" y1="9" x2="22" y2="15"></line></svg>';

    /* ====================== Лайки ====================== */
    function bindLikes(root) {
        (root || document).querySelectorAll('.like-btn:not([data-bound])').forEach(function (btn) {
            btn.setAttribute('data-bound', '1');
            btn.addEventListener('click', function () {
                if (btn._busy) return;
                btn._busy = true;
                var id = btn.getAttribute('data-post-id');
                postForm(CFG.urls.like.replace('/0/', '/' + id + '/'), new FormData())
                    .then(function (res) {
                        btn._busy = false;
                        if (!res.ok) return;
                        var liked = res.data.liked;
                        btn.setAttribute('data-liked', liked ? 'true' : 'false');
                        btn.classList.toggle('liked', liked);
                        btn.style.color = liked ? '#e0245e' : '';
                        var icon = btn.querySelector('.like-icon');
                        if (icon) icon.innerHTML = liked ? LIKE_FILLED : LIKE_OUTLINE;
                        updateCounts(btn.closest('.post-card'), res.data.likes_count, null);
                    })
                    .catch(function () { btn._busy = false; });
            });
        });
    }

    /* ====================== Комментарии ====================== */
    function commentHtml(cid, author, avatarUrl, text, postId) {
        var profileUrl = CFG.profileBase + encodeURIComponent(author) + '/';
        var avatar = avatarUrl
            ? '<img src="' + esc(avatarUrl) + '" alt="">'
            : '<span class="comment-avatar-ph">' + esc((author || '?').charAt(0).toUpperCase()) + '</span>';
        return '' +
            '<a class="comment-avatar" href="' + profileUrl + '">' + avatar + '</a>' +
            '<div class="comment-main">' +
            '  <div class="comment-line">' +
            '    <a class="comment-author" href="' + profileUrl + '">' + esc(author) + '</a>' +
            '    <span class="comment-text">' + esc(text) + '</span>' +
            '  </div>' +
            '  <div class="comment-meta"><span class="comment-time">только что</span></div>' +
            '</div>' +
            '<button type="button" class="delete-comment-btn" data-comment-id="' + cid +
            '" data-post-id="' + postId + '" title="Удалить">' + TRASH_SVG + '</button>';
    }

    function syncShowMore(card) {
        if (!card) return;
        var block = card.querySelector('.comments-block');
        if (!block) return;
        var list = block.querySelector('.comments-list');
        var total = list ? list.querySelectorAll('.comment').length : 0;
        var sm = block.querySelector('.show-more-comments');
        if (total === 0) {
            if (list && !list.querySelector('.comments-empty')) {
                list.innerHTML = '<div class="comments-empty">Пока нет комментариев — напишите первый.</div>';
            }
            block.classList.remove('expanded');
            if (sm) sm.style.display = 'none';
        } else if (sm) {
            sm.style.display = (total > 2 && !block.classList.contains('expanded')) ? '' : 'none';
        }
    }

    function bindComments(root) {
        var scope = root || document;

        scope.querySelectorAll('.toggle-comments-btn:not([data-bound])').forEach(function (btn) {
            btn.setAttribute('data-bound', '1');
            btn.addEventListener('click', function () {
                var block = document.getElementById('comments-' + btn.getAttribute('data-post-id'));
                if (block) block.style.display = block.style.display === 'none' ? 'block' : 'none';
            });
        });

        scope.querySelectorAll('.add-comment-form:not([data-bound])').forEach(function (form) {
            form.setAttribute('data-bound', '1');
            var input = form.querySelector('input[name=text]');
            var sendBtn = form.querySelector('.comment-send-btn');
            var syncSend = function () {
                if (sendBtn) sendBtn.disabled = !(input.value || '').trim();
            };
            if (input) input.addEventListener('input', syncSend);
            syncSend();

            form.addEventListener('submit', function (e) {
                e.preventDefault();
                var text = (input.value || '').trim();
                if (!text) return;
                var id = form.getAttribute('data-post-id');
                var fd = new FormData();
                fd.append('text', text);
                postForm(CFG.urls.comment.replace('/0/', '/' + id + '/'), fd)
                    .then(function (res) {
                        if (!res.ok) { toast(res.data.error || 'Не удалось отправить'); return; }
                        var d = res.data;
                        var card = document.getElementById('post-' + id);
                        var block = form.closest('.comments-block');
                        var list = block.querySelector('.comments-list');
                        var empty = list.querySelector('.comments-empty');
                        if (empty) empty.remove();
                        block.classList.add('expanded');
                        var div = document.createElement('div');
                        div.className = 'comment';
                        div.id = 'comment-' + d.id;
                        div.innerHTML = commentHtml(d.id, d.author, d.author_avatar, d.text, id);
                        list.appendChild(div);
                        input.value = '';
                        syncSend();
                        updateCounts(card, null, d.comments_count);
                        syncShowMore(card);
                    })
                    .catch(function () { toast('Ошибка сети'); });
            });
        });

        scope.querySelectorAll('.delete-comment-btn:not([data-bound])').forEach(function (btn) {
            btn.setAttribute('data-bound', '1');
        });
    }

    document.addEventListener('click', function (e) {
        var btn = e.target.closest && e.target.closest('.delete-comment-btn');
        if (!btn || btn._busy) return;
        btn._busy = true;
        var cid = btn.getAttribute('data-comment-id');
        var fd = new FormData();
        postForm(CFG.urls.commentDelete.replace('/0/', '/' + cid + '/'), fd)
            .then(function (res) {
                btn._busy = false;
                if (!res.ok) { toast('Нельзя удалить'); return; }
                var card = btn.closest('.post-card');
                var el = document.getElementById('comment-' + cid);
                if (el) el.remove();
                updateCounts(card, null, res.data.comments_count);
                syncShowMore(card);
            })
            .catch(function () { btn._busy = false; toast('Ошибка сети'); });
    });

    /* Показать ещё комментарии */
    document.addEventListener('click', function (e) {
        var sm = e.target.closest && e.target.closest('.show-more-comments');
        if (!sm) return;
        var block = sm.closest('.comments-block');
        if (block) block.classList.add('expanded');
    });

    /* Поделиться постом (копирование ссылки) */
    document.addEventListener('click', function (e) {
        var btn = e.target.closest && e.target.closest('.share-post-btn');
        if (!btn) return;
        var id = btn.getAttribute('data-post-id');
        var url = location.origin + location.pathname + '#post-' + id;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url)
                .then(function () { toast('Ссылка на публикацию скопирована'); })
                .catch(function () { toast(url); });
        } else {
            toast(url);
        }
    });

    /* Двойной клик по посту — лайк (как в Threads) */
    document.addEventListener('dblclick', function (e) {
        var card = e.target.closest && e.target.closest('.post-card');
        if (!card) return;
        if (e.target.closest('button, a, input, textarea, form, video, .comments-block, .post-media')) return;
        var likeBtn = card.querySelector('.like-btn');
        if (likeBtn && likeBtn.getAttribute('data-liked') !== 'true') likeBtn.click();
    });

    /* ====================== Удаление (подтверждение) ====================== */
    var confirmOverlay = document.getElementById('confirmOverlay');
    var confirmTextEl = document.getElementById('confirmText');
    var confirmAction = null;
    var confirmCancelAction = null;

    function openConfirm(message, action, cancel) {
        confirmAction = action;
        confirmCancelAction = cancel || null;
        if (confirmTextEl && message) confirmTextEl.textContent = message;
        if (confirmOverlay) confirmOverlay.style.display = 'flex';
    }
    function closeConfirm(runCancel) {
        var cb = confirmCancelAction;
        confirmAction = null;
        confirmCancelAction = null;
        if (confirmOverlay) confirmOverlay.style.display = 'none';
        if (runCancel && cb) cb();
    }

    if (confirmOverlay) {
        document.getElementById('confirmCancel').addEventListener('click', function () { closeConfirm(true); });
        confirmOverlay.addEventListener('click', function (e) {
            if (e.target === confirmOverlay) closeConfirm(true);
        });
        document.getElementById('confirmDelete').addEventListener('click', function () {
            var act = confirmAction;
            closeConfirm(false);
            if (act) act();
        });
    }

    document.addEventListener('click', function (e) {
        var btn = e.target.closest && e.target.closest('.delete-post-btn');
        if (!btn) return;
        var id = btn.getAttribute('data-post-id');
        openConfirm('Удалить публикацию?', function () {
            postForm(CFG.urls.delete.replace('/0/', '/' + id + '/'), new FormData())
                .then(function (res) {
                    if (!res.ok || !res.data.deleted) { toast(res.data.error || 'Не удалось удалить'); return; }
                    var card = document.getElementById('post-' + id);
                    if (card) card.remove();
                    toast('Публикация удалена');
                })
                .catch(function () { toast('Ошибка сети'); });
        });
    });

    /* ====================== Редактирование поста ====================== */
    document.addEventListener('click', function (e) {
        var btn = e.target.closest && e.target.closest('.edit-post-btn');
        if (btn) startEditPost(btn);
    });

    function markEdited(card) {
        var m = card.querySelector('.post-edited');
        if (m) m.style.display = 'inline';
    }

    function startEditPost(btn) {
        var id = btn.getAttribute('data-post-id');
        var card = document.getElementById('post-' + id);
        if (!card || card._editing) return;
        card._editing = true;

        var el = card.querySelector('.post-content');
        if (!el) {
            el = document.createElement('div');
            el.className = 'post-content';
            el.style.marginTop = '10px';
            var actions = card.querySelector('.post-actions');
            if (actions) card.insertBefore(el, actions); else card.appendChild(el);
        }

        var wrap = document.createElement('div');
        wrap.style.cssText = 'margin-top:10px;';
        var ta = document.createElement('textarea');
        ta.value = el.textContent || '';
        ta.setAttribute('maxlength', '10000');
        ta.style.cssText = 'width:100%; min-height:80px; resize:vertical; font-family:inherit; margin-bottom:8px;';
        var row = document.createElement('div');
        row.style.cssText = 'display:flex; gap:8px; justify-content:flex-end;';

        var cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'btn-ghost';
        cancel.textContent = 'Отмена';

        var save = document.createElement('button');
        save.type = 'button';
        save.className = 'btn-primary';
        save.style.padding = '8px 16px';
        save.textContent = 'Сохранить';

        row.appendChild(cancel);
        row.appendChild(save);
        wrap.appendChild(ta);
        wrap.appendChild(row);
        el.insertAdjacentElement('afterend', wrap);
        el.style.display = 'none';
        ta.focus();

        function finish() {
            card._editing = false;
            wrap.remove();
            el.style.display = (el.textContent || '').trim() ? '' : 'none';
        }

        cancel.addEventListener('click', finish);

        save.addEventListener('click', function () {
            if (save._busy) return;
            save._busy = true;
            var fd = new FormData();
            fd.append('content', (ta.value || '').trim());
            postForm(CFG.urls.edit.replace('/0/', '/' + id + '/'), fd)
                .then(function (res) {
                    save._busy = false;
                    if (!res.ok || !res.data.ok) {
                        toast((res.data && res.data.error) || 'Не удалось сохранить');
                        return;
                    }
                    el.textContent = res.data.content;
                    card._editing = false;
                    wrap.remove();
                    el.style.display = (res.data.content || '').trim() ? '' : 'none';
                    markEdited(card);
                    toast('Публикация обновлена');
                })
                .catch(function () { save._busy = false; toast('Ошибка сети'); });
        });
    }

    /* ====================== Карусель: точки ====================== */
    function bindCarouselDots(root) {
        (root || document).querySelectorAll('.carousel-track').forEach(function (track) {
            if (track._dotsBound) return;
            track._dotsBound = true;
            var wrap = track.closest('.post-carousel');
            if (!wrap) return;
            var dots = wrap.querySelectorAll('.carousel-dot');
            if (!dots.length) return;
            track.addEventListener('scroll', function () {
                var i = Math.round(track.scrollLeft / Math.max(track.clientWidth, 1));
                dots.forEach(function (d, idx) { d.classList.toggle('active', idx === i); });
            }, { passive: true });
        });
    }

    /* ====================== Бесконечная прокрутка ====================== */
    var feedPosts = document.getElementById('feedPosts');
    var feedLoading = document.getElementById('feedLoading');
    var nextPage = 2;
    var loadingPosts = false;
    var noMorePosts = !(CFG.hasMore === true || CFG.hasMore === undefined);

    function loadMorePosts() {
        if (loadingPosts || noMorePosts || !feedPosts) return;
        loadingPosts = true;
        if (feedLoading) feedLoading.style.display = 'block';
        getJSON(CFG.urls.feed + '?page=' + nextPage)
            .then(function (d) {
                loadingPosts = false;
                if (feedLoading) feedLoading.style.display = 'none';
                if (!d || !Array.isArray(d.html)) { noMorePosts = true; return; }
                var frag = document.createElement('div');
                frag.innerHTML = d.html.join('');
                while (frag.firstChild) feedPosts.appendChild(frag.firstChild);
                nextPage += 1;
                noMorePosts = !d.has_next;
                bindAll(feedPosts);
            })
            .catch(function () { loadingPosts = false; if (feedLoading) feedLoading.style.display = 'none'; });
    }

    if (feedLoading && 'IntersectionObserver' in window) {
        new IntersectionObserver(function (entries) {
            entries.forEach(function (en) { if (en.isIntersecting) loadMorePosts(); });
        }, { rootMargin: '600px' }).observe(feedLoading);
    }

    /* ====================== Лайтбокс ====================== */
    var lightbox = document.getElementById('lightboxOverlay');
    var lightboxTrack = document.getElementById('lightboxTrack');
    var lightboxIndex = 0;

    function mediaListFromCard(card) {
        var nodes = card.querySelectorAll('.carousel-track img, .carousel-track video, .grid-media');
        var out = [];
        nodes.forEach(function (n) {
            if (n.tagName === 'IMG') out.push({ type: 'image', url: n.src });
            else out.push({ type: 'video', url: n.currentSrc || n.src });
        });
        return out;
    }

    function renderLightbox(items) {
        lightboxTrack.innerHTML = '';
        items.forEach(function (it) {
            var wrap = document.createElement('div');
            wrap.style.cssText =
                'flex:0 0 100%;scroll-snap-align:center;display:flex;align-items:center;' +
                'justify-content:center;height:100%;';
            if (it.type === 'video') {
                var v = document.createElement('video');
                v.src = it.url;
                v.controls = true;
                v.playsInline = true;
                v.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;background:#000;';
                wrap.appendChild(v);
            } else {
                var img = document.createElement('img');
                img.src = it.url;
                img.alt = '';
                img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;';
                wrap.appendChild(img);
            }
            lightboxTrack.appendChild(wrap);
        });
    }

    function openLightbox(items, startIndex) {
        if (!lightbox || !items.length) return;
        renderLightbox(items);
        lightbox.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        lightboxIndex = startIndex || 0;
        requestAnimationFrame(function () {
            lightboxTrack.scrollLeft = lightboxIndex * lightboxTrack.clientWidth;
        });
    }

    function closeLightbox() {
        if (!lightbox) return;
        lightboxTrack.pause && lightboxTrack.pause();
        lightboxTrack.querySelectorAll('video').forEach(function (v) { v.pause(); });
        lightbox.style.display = 'none';
        lightboxTrack.innerHTML = '';
        document.body.style.overflow = '';
    }

    if (lightbox) {
        document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
        lightbox.addEventListener('click', function (e) { if (e.target === lightbox) closeLightbox(); });
        document.getElementById('lightboxPrev').addEventListener('click', function () {
            lightboxTrack.scrollBy({ left: -lightboxTrack.clientWidth, behavior: 'smooth' });
        });
        document.getElementById('lightboxNext').addEventListener('click', function () {
            lightboxTrack.scrollBy({ left: lightboxTrack.clientWidth, behavior: 'smooth' });
        });
    }

    document.addEventListener('click', function (e) {
        var media = e.target.closest && e.target.closest('.carousel-img, .grid-media');
        if (!media) return;
        if (media.tagName === 'VIDEO') return;
        var card = media.closest('[data-post-id]');
        if (!card) return;
        var items = mediaListFromCard(card);
        var start = 0;
        items.forEach(function (it, i) { if (it.url === media.src) start = i; });
        openLightbox(items, start);
    });

    /* ====================== Создание истории ====================== */
    var storyModal = document.getElementById('storyCreateModal');
    var storyInput = document.getElementById('storyFileInput');
    var storyPicker = document.getElementById('storyPickerArea');
    var storyPreview = document.getElementById('storyPreview');
    var storySubmit = document.getElementById('storySubmitBtn');
    var storyError = document.getElementById('storyError');
    var storyFile = null;

    function setStoryError(msg) {
        if (!storyError) return;
        storyError.textContent = msg || '';
        storyError.style.display = msg ? 'block' : 'none';
    }

    function renderStoryPreview() {
        if (!storyFile) {
            storyPreview.style.display = 'none';
            storyPreview.innerHTML = '';
            storySubmit.disabled = true;
            return;
        }
        storyPreview.style.display = 'grid';
        storyPreview.style.gridTemplateColumns = '1fr';
        storyPreview.innerHTML = '';
        var cell = document.createElement('div');
        cell.className = 'preview-cell';
        var url = URL.createObjectURL(storyFile);
        if (storyFile.type.startsWith('video/')) {
            var v = document.createElement('video');
            v.src = url; v.muted = true; v.playsInline = true;
            cell.appendChild(v);
        } else {
            var img = document.createElement('img');
            img.src = url; img.alt = '';
            cell.appendChild(img);
        }
        var rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'preview-remove-btn';
        rm.title = 'Убрать';
        rm.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
        rm.addEventListener('click', function () { storyFile = null; storyInput.value = ''; renderStoryPreview(); });
        cell.appendChild(rm);
        storyPreview.appendChild(cell);
        storyPicker.style.display = 'none';
        storySubmit.disabled = false;
    }

    if (storyModal) {
        document.getElementById('addStoryBtn').addEventListener('click', function () {
            storyFile = null;
            storyInput.value = '';
            setStoryError('');
            renderStoryPreview();
            storyPicker.style.display = 'flex';
            storyModal.showModal();
        });
        storyPicker.addEventListener('click', function () { storyInput.click(); });
        storyInput.addEventListener('change', function () {
            storyFile = storyInput.files && storyInput.files[0] ? storyInput.files[0] : null;
            setStoryError('');
            renderStoryPreview();
        });
        storyModal.querySelectorAll('[data-close-story]').forEach(function (btn) {
            btn.addEventListener('click', function () { storyModal.close(); });
        });
        storySubmit.addEventListener('click', function () {
            if (!storyFile) return;
            storySubmit.disabled = true;
            var fd = new FormData();
            fd.append('media', storyFile);
            postForm(CFG.urls.uploadStory, fd)
                .then(function (res) {
                    if (!res.ok) { setStoryError(res.data.error || 'Не удалось загрузить'); storySubmit.disabled = false; return; }
                    storyModal.close();
                    toast('История опубликована');
                    storyFile = null;
                    storyInput.value = '';
                    renderStoryPreview();
                    refreshStoriesBar();
                })
                .catch(function () { setStoryError('Ошибка сети'); storySubmit.disabled = false; });
        });
    }

    /* ====================== Просмотрщик историй ====================== */
    var viewer = document.getElementById('storyViewer');
    var viewerTimer = null;

    function stopViewerTimer() {
        clearTimeout(viewerTimer);
        viewerTimer = null;
    }

    function StoryViewer(root) {
        this.root = root;
        this.group = null;
        this.index = 0;
        this.track = document.getElementById('storyProgress');
        this.authorEl = document.getElementById('viewer-author');
        this.avatarEl = document.getElementById('viewer-avatar');
        this.captionEl = document.getElementById('viewer-caption');
        this.mediaBox = root.querySelector('.story-viewer-media');
        this.deleteBtn = document.getElementById('storyDeleteBtn');
        this.soundBtn = document.getElementById('storySoundBtn');
        this.muted = false;
        this._origAppend = null;
    }

    StoryViewer.prototype.open = function (group) {
        this.group = group;
        this.index = 0;
        this.root.classList.add('open');
        document.body.style.overflow = 'hidden';
        this.authorEl.textContent = group.author_name;
        if (group.author_avatar) {
            this.avatarEl.src = group.author_avatar;
            this.avatarEl.style.display = 'block';
        } else {
            this.avatarEl.removeAttribute('src');
            this.avatarEl.style.display = 'none';
        }
        var isOwn = String(group.author_id) === String(CFG.meId);
        this.deleteBtn.style.display = isOwn ? 'flex' : 'none';
        this.renderProgress();
        this.show(0);
    };

    StoryViewer.prototype.deleteCurrent = function () {
        var self = this;
        if (!this.group) return;
        var item = this.group.items[this.index];
        if (!item) return;
        stopViewerTimer();
        openConfirm('Удалить историю?', function () {
            if (self.deleteBtn._busy) return;
            self.deleteBtn._busy = true;
            postForm(CFG.urls.deleteStory.replace('/0/', '/' + item.id + '/'), new FormData())
                .then(function (res) {
                    self.deleteBtn._busy = false;
                    if (!res.ok || !res.data.deleted) {
                        toast((res.data && res.data.error) || 'Не удалось удалить');
                        if (self.group) self.show(self.index);
                        return;
                    }
                    var idx = -1;
                    self.group.items.forEach(function (it, i) { if (it.id === item.id) idx = i; });
                    if (idx >= 0) self.group.items.splice(idx, 1);
                    toast('История удалена');
                    if (!self.group.items.length) {
                        self.close();
                    } else {
                        if (self.index >= self.group.items.length) {
                            self.index = self.group.items.length - 1;
                        }
                        self.show(self.index);
                    }
                    refreshStoriesBar();
                })
                .catch(function () {
                    self.deleteBtn._busy = false;
                    toast('Ошибка сети');
                    if (self.group) self.show(self.index);
                });
        }, function () {
            if (self.group) self.show(self.index);
        });
    };

    StoryViewer.prototype.close = function () {
        stopViewerTimer();
        this.root.classList.remove('open');
        document.body.style.overflow = '';
        this.clearMedia();
        if (this.soundBtn) this.soundBtn.style.display = 'none';
        this.group = null;
    };

    StoryViewer.prototype.clearMedia = function () {
        if (this._customMedia && this._customMedia.parentNode) {
            try { this._customMedia.pause(); } catch (e) {}
            this._customMedia.parentNode.removeChild(this._customMedia);
        }
        this._customMedia = null;
        if (this.captionEl) this.captionEl.style.display = 'none';
    };

    StoryViewer.prototype.renderProgress = function (animate) {
        var html = '';
        for (var i = 0; i < this.group.items.length; i++) {
            var cls = i < this.index ? 'seg done' : (i === this.index ? 'seg active' : 'seg');
            html += '<div class="' + cls + '"><div class="fill"></div></div>';
        }
        this.track.innerHTML = html;
        if (animate === false) {
            var act = this.track.querySelector('.seg.active .fill');
            if (act) {
                act.style.transition = 'none';
                act.style.width = '0';
            }
            return;
        }
        var active = this.track.querySelector('.seg.active .fill');
        if (active) {
            active.style.transition = 'none';
            active.style.width = '0';
            void active.offsetWidth;
            active.style.transition = '';
            requestAnimationFrame(function () { active.style.width = '100%'; });
        }
    };

    StoryViewer.prototype.updateSoundBtn = function () {
        if (!this.soundBtn) return;
        this.soundBtn.innerHTML = this.muted ? SOUND_OFF_SVG : SOUND_ON_SVG;
        this.soundBtn.title = this.muted ? 'Включить звук' : 'Выключить звук';
        this.soundBtn.style.opacity = this.muted ? '0.6' : '1';
    };

    StoryViewer.prototype.toggleSound = function () {
        this.muted = !this.muted;
        var media = this._customMedia;
        if (media && media.tagName === 'VIDEO') {
            media.muted = this.muted;
            if (!this.muted) {
                var p = media.play();
                if (p && p.catch) p.catch(function () {});
            }
        }
        this.updateSoundBtn();
    };

    StoryViewer.prototype.show = function (i) {
        if (!this.group) return;
        if (i < 0) return this.prev();
        if (i >= this.group.items.length) return this.close();
        stopViewerTimer();
        this.index = i;
        var item = this.group.items[i];
        var isVideo = item.type === 'video';
        this.clearMedia();
        this.renderProgress(!isVideo);
        if (this.soundBtn) this.soundBtn.style.display = isVideo ? 'flex' : 'none';

        var self = this;
        var el;
        if (isVideo) {
            el = document.createElement('video');
            el.src = item.url;
            el.autoplay = true;
            el.playsInline = true;
            el.muted = this.muted;
            this.updateSoundBtn();

            el.addEventListener('ended', function () { self.next(); });
            el.addEventListener('timeupdate', function () {
                if (!el.duration || !isFinite(el.duration)) return;
                var seg = self.track.querySelector('.seg.active');
                var fill = seg && seg.querySelector('.fill');
                if (!fill) return;
                fill.style.transition = 'none';
                fill.style.width = Math.min(100, (el.currentTime / el.duration) * 100) + '%';
            });
            el.addEventListener('error', function () {
                if (!viewerTimer) viewerTimer = setTimeout(function () { self.next(); }, 5000);
            });
        } else {
            el = document.createElement('img');
            el.src = item.url;
            el.alt = '';
        }
        el.className = 'viewer-actual-media';
        el.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000;';
        this.mediaBox.appendChild(el);
        this._customMedia = el;

        if (item.caption) {
            this.captionEl.textContent = item.caption;
            this.captionEl.style.display = 'block';
        }

        if (isVideo) {
            var play = el.play();
            if (play && play.catch) {
                play.catch(function () {
                    el.muted = true;
                    self.muted = true;
                    self.updateSoundBtn();
                    var retry = el.play();
                    if (retry && retry.catch) retry.catch(function () {
                        viewerTimer = setTimeout(function () { self.next(); }, 5000);
                    });
                });
            }
        } else {
            viewerTimer = setTimeout(function () { self.next(); }, 5000);
        }
    };

    StoryViewer.prototype.next = function () { this.show(this.index + 1); };
    StoryViewer.prototype.prev = function () { this.show(this.index - 1); };

    var storyViewer = viewer ? new StoryViewer(viewer) : null;

    if (viewer) {
        document.getElementById('storyViewerClose').addEventListener('click', function () { storyViewer.close(); });
        document.getElementById('storyNextZone').addEventListener('click', function () { storyViewer.next(); });
        document.getElementById('storyPrevZone').addEventListener('click', function () { storyViewer.prev(); });
        document.getElementById('storyDeleteBtn').addEventListener('click', function () { storyViewer.deleteCurrent(); });
        document.getElementById('storySoundBtn').addEventListener('click', function () { storyViewer.toggleSound(); });
    }

    function openStoriesFor(authorId, authorName, authorAvatar) {
        getJSON(CFG.urls.activeStories).then(function (d) {
            var groups = (d && d.stories) || [];
            var group = null;
            groups.forEach(function (g) { if (String(g.author_id) === String(authorId)) group = g; });
            if (!group || !group.items.length) { toast('Истории недоступны'); return; }
            storyViewer.open(group);
        }).catch(function () { toast('Не удалось загрузить истории'); });
    }

    function bindStoryBubbles(root) {
        (root || document).querySelectorAll('.story-item[data-author-id]:not([data-bound])').forEach(function (btn) {
            btn.setAttribute('data-bound', '1');
            btn.addEventListener('click', function () {
                openStoriesFor(
                    btn.getAttribute('data-author-id'),
                    btn.getAttribute('data-author-name'),
                    btn.getAttribute('data-author-avatar')
                );
            });
        });
    }

    function refreshStoriesBar() {
        var bar = document.getElementById('storiesBar');
        if (!bar) return;
        getJSON(CFG.urls.activeStories).then(function (d) {
            var groups = (d && d.stories) || [];
            var me = String(CFG.meId);
            while (bar.children.length > 1) bar.removeChild(bar.lastChild);
            if (!groups.length) {
                var empty = document.createElement('span');
                empty.className = 'story-label';
                empty.style.cssText = 'color:var(--muted);max-width:none;align-self:center;';
                empty.textContent = 'Пока нет историй';
                bar.appendChild(empty);
                return;
            }
            var hasOwn = false;
            groups.forEach(function (g) {
                var isMe = String(g.author_id) === me;
                if (isMe) hasOwn = true;
                var btn = document.createElement('button');
                btn.className = 'story-item';
                btn.type = 'button';
                btn.setAttribute('data-author-id', g.author_id);
                btn.setAttribute('data-author-name', g.author_name);
                btn.setAttribute('data-author-avatar', g.author_avatar || '');
                var av = document.createElement('span');
                av.className = 'story-avatar has-story';
                if (g.author_avatar) {
                    var img = document.createElement('img');
                    img.src = g.author_avatar;
                    img.alt = g.author_name;
                    av.appendChild(img);
                } else {
                    var ph = document.createElement('span');
                    ph.className = 'story-avatar-placeholder';
                    ph.textContent = (g.author_name || '?').charAt(0).toUpperCase();
                    av.appendChild(ph);
                }
                var label = document.createElement('span');
                label.className = 'story-label';
                label.textContent = isMe ? 'Моя история' : g.author_name;
                btn.appendChild(av);
                btn.appendChild(label);
                if (isMe) bar.insertBefore(btn, bar.children[1] || null);
                else bar.appendChild(btn);
            });
            if (hasOwn) {
                var addLabel = bar.querySelector('#addStoryBtn .story-label');
                if (addLabel) addLabel.textContent = 'Добавить';
            }
            bindStoryBubbles(bar);
        }).catch(function () {});
    }

    /* ====================== Создание поста (FAB) ====================== */
    var postModal = document.getElementById('postCreateModal');
    var postInput = document.getElementById('postFileInput');
    var postPicker = document.getElementById('postPickerArea');
    var postPreview = document.getElementById('postPreview');
    var addMoreBtn = document.getElementById('addMoreMediaBtn');
    var viewMode = document.getElementById('postViewMode');
    var captionLabel = document.getElementById('captionLabel');
    var captionArea = document.getElementById('postCaption');
    var postSubmit = document.getElementById('postSubmitBtn');
    var postBack = document.getElementById('postModalBack');
    var postError = document.getElementById('postError');
    var textOnlyBtn = document.getElementById('textOnlyPostBtn');
    var postFiles = [];
    var postLayout = 'carousel';
    var postStep = 1;

    function setPostError(msg) {
        if (!postError) return;
        postError.textContent = msg || '';
        postError.style.display = msg ? 'block' : 'none';
    }

    function resetPostModal() {
        postFiles = [];
        postLayout = 'carousel';
        postStep = 1;
        postInput.value = '';
        if (captionArea) captionArea.value = '';
        setPostError('');
        renderPostModal();
    }

    function renderPostModal() {
        var hasFiles = postFiles.length > 0;
        var atCaption = postStep === 2;

        postPicker.style.display = hasFiles || atCaption ? 'none' : 'flex';
        if (textOnlyBtn) textOnlyBtn.style.display = !hasFiles && !atCaption ? 'flex' : 'none';
        addMoreBtn.style.display = hasFiles ? 'inline-flex' : 'none';
        viewMode.style.display = hasFiles && postFiles.length > 1 ? 'flex' : 'none';
        captionLabel.style.display = atCaption ? 'block' : 'none';
        captionLabel.textContent = hasFiles ? 'Подпись' : 'Текст';
        captionArea.style.display = atCaption ? 'block' : 'none';
        if (captionArea) captionArea.placeholder = hasFiles ? 'Напишите подпись…' : 'О чём думаете?';
        postBack.style.visibility = atCaption ? 'visible' : 'hidden';
        postSubmit.textContent = atCaption ? 'Опубликовать' : 'Далее';
        postSubmit.disabled = atCaption ? false : !hasFiles;

        postPreview.innerHTML = '';
        postPreview.style.display = hasFiles ? 'grid' : 'none';
        postFiles.forEach(function (f, idx) {
            var cell = document.createElement('div');
            cell.className = 'preview-cell';
            var url = URL.createObjectURL(f);
            if (f.type.startsWith('video/')) {
                var v = document.createElement('video');
                v.src = url; v.muted = true; v.playsInline = true;
                cell.appendChild(v);
            } else {
                var img = document.createElement('img');
                img.src = url; img.alt = '';
                cell.appendChild(img);
            }
            var rm = document.createElement('button');
            rm.type = 'button';
            rm.className = 'preview-remove-btn';
            rm.title = 'Убрать';
            rm.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
            rm.addEventListener('click', function () {
                postFiles.splice(idx, 1);
                if (!postFiles.length) postStep = 1;
                renderPostModal();
            });
            cell.appendChild(rm);
            postPreview.appendChild(cell);
        });
    }

    function addPostFiles(fileList) {
        var arr = Array.prototype.slice.call(fileList || []);
        arr.forEach(function (f) {
            if (postFiles.length >= 10) return;
            if (f.type.startsWith('image/') || f.type.startsWith('video/')) postFiles.push(f);
        });
        setPostError('');
        renderPostModal();
    }

    if (postModal) {
        document.getElementById('openPostModal').addEventListener('click', function () {
            resetPostModal();
            postModal.showModal();
        });

        postPicker.addEventListener('click', function () { postInput.click(); });
        if (textOnlyBtn) {
            textOnlyBtn.addEventListener('click', function () {
                postStep = 2;
                renderPostModal();
                captionArea.focus();
            });
        }
        addMoreBtn.addEventListener('click', function () { postInput.click(); });
        postInput.addEventListener('change', function () {
            addPostFiles(postInput.files);
            postInput.value = '';
        });

        ['dragover', 'drop'].forEach(function (ev) {
            postModal.addEventListener(ev, function (e) { e.preventDefault(); });
        });
        postPicker.addEventListener('drop', function (e) {
            if (e.dataTransfer && e.dataTransfer.files) addPostFiles(e.dataTransfer.files);
        });

        viewMode.querySelectorAll('button').forEach(function (btn) {
            btn.addEventListener('click', function () {
                postLayout = btn.getAttribute('data-mode');
                viewMode.querySelectorAll('button').forEach(function (b) {
                    b.classList.toggle('active', b === btn);
                });
            });
        });

        postBack.addEventListener('click', function () { postStep = 1; renderPostModal(); });

        postSubmit.addEventListener('click', function () {
            if (postStep === 1) {
                if (!postFiles.length) return;
                postStep = 2;
                renderPostModal();
                captionArea.focus();
                return;
            }
            if (!postFiles.length && !(captionArea.value || '').trim()) {
                setPostError('Добавьте текст или выберите фото');
                return;
            }
            postSubmit.disabled = true;
            var fd = new FormData();
            fd.append('content', captionArea.value || '');
            fd.append('layout', postLayout);
            postFiles.forEach(function (f) { fd.append('images', f); });
            postForm(CFG.urls.feed, fd)
                .then(function (res) {
                    if (!res.ok) { setPostError('Не удалось опубликовать'); postSubmit.disabled = false; return; }
                    var html = buildPostCard(res.data);
                    if (feedPosts) feedPosts.insertAdjacentHTML('afterbegin', html);
                    else if (feedMain) feedMain.insertAdjacentHTML('afterbegin', html);
                    postModal.close();
                    toast('Публикация опубликована');
                    resetPostModal();
                    bindAll(document);
                    var empty = document.querySelector('.feed-empty');
                    if (empty) empty.remove();
                })
                .catch(function () { setPostError('Ошибка сети'); postSubmit.disabled = false; });
        });
    }

    /* ====================== Новая карточка поста ====================== */
    function avatarHtml(username, avatarUrl) {
        if (avatarUrl) {
            return '<img src="' + esc(avatarUrl) + '" alt="' + esc(username) + '">';
        }
        return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.7 0 4.9-2.2 4.9-4.9S14.7 2.2 12 2.2 7.1 4.4 7.1 7.1 9.3 12 12 12zm0 2.4c-3.3 0-9.8 1.6-9.8 4.9v2.4h19.6v-2.4c0-3.3-6.5-4.9-9.8-4.9z"/></svg>';
    }

    function mediaHtml(items, layout) {
        if (!items || !items.length) return '';
        var i, out = '';
        if (layout === 'grid' && items.length > 1) {
            out += '<div class="post-grid">';
            for (i = 0; i < items.length; i++) {
                out += items[i].type === 'video'
                    ? '<video src="' + esc(items[i].url) + '" class="grid-media" controls playsinline></video>'
                    : '<img src="' + esc(items[i].url) + '" class="grid-media">';
            }
            out += '</div>';
            return out;
        }
        out += '<div class="post-carousel"><div class="carousel-track">';
        for (i = 0; i < items.length; i++) {
            out += items[i].type === 'video'
                ? '<video src="' + esc(items[i].url) + '" class="carousel-img" controls playsinline></video>'
                : '<img src="' + esc(items[i].url) + '" class="carousel-img">';
        }
        out += '</div>';
        if (items.length > 1) {
            out += '<div class="carousel-dots">';
            for (i = 0; i < items.length; i++) {
                out += '<span class="carousel-dot' + (i === 0 ? ' active' : '') + '"></span>';
            }
            out += '</div>';
        }
        out += '</div>';
        return out;
    }

    function buildPostCard(d) {
        var profileUrl = CFG.profileBase + encodeURIComponent(d.author) + '/';
        var caption = d.content
            ? '<div class="post-content" style="margin-top:10px;">' + esc(d.content) + '</div>'
            : '';
        return '' +
            '<div class="card post-card" id="post-' + d.id + '" data-post-id="' + d.id + '">' +
            '  <div style="display:flex; justify-content:space-between; align-items:center;">' +
            '    <div style="display:flex; align-items:center; gap:10px;">' +
            '      <a href="' + profileUrl + '"><span class="post-avatar">' +
                      avatarHtml(d.author, d.author_avatar) + '</span></a>' +
            '      <div><a href="' + profileUrl + '" style="text-decoration:none; color:inherit;">' +
            '        <span class="post-author">' + esc(d.author) + '</span></a>' +
            '        <span style="color:var(--muted); font-size:13px; margin-left:6px;">' +
                      esc(d.created_at) + '<span class="post-edited" style="display:none;"> · изменено</span></span></div>' +
            '    </div>' +
            '    <div style="display:flex; align-items:center; gap:2px;">' +
            '      <button type="button" class="edit-post-btn" data-post-id="' + d.id +
                  '" title="Редактировать" style="background:none;border:none;color:var(--muted);cursor:pointer;display:flex;align-items:center;padding:4px;">' +
                      PENCIL_SVG + '</button>' +
            '      <button type="button" class="delete-post-btn" data-post-id="' + d.id +
                  '" style="background:none;border:none;color:var(--muted);cursor:pointer;display:flex;align-items:center;padding:4px;">' +
                  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/></svg>' +
            '    </button>' +
            '    </div>' +
            '  </div>' +
            caption +
            '<div class="post-media">' + mediaHtml(d.media_items, d.layout) + '</div>' +
            '  <div class="post-actions">' +
            '    <button type="button" class="like-btn" data-post-id="' + d.id + '" data-liked="false" aria-label="Нравится">' +
            '      <span class="like-icon">' + LIKE_OUTLINE + '</span></button>' +
            '    <button type="button" class="toggle-comments-btn" data-post-id="' + d.id + '" aria-label="Комментарии">' + BUBBLE_SVG + '</button>' +
            '    <button type="button" class="share-post-btn" data-post-id="' + d.id + '" aria-label="Поделиться">' + PLANE_SVG + '</button>' +
            '  </div>' +
            '  <div class="post-meta-line">' +
            '    <span class="likes-count">' + likesText(0) + '</span>' +
            '    <span class="meta-sep">·</span>' +
            '    <span class="comments-count toggle-comments-btn" data-post-id="' + d.id + '">' + commentsText(0) + '</span>' +
            '  </div>' +
            '  <div class="comments-block" id="comments-' + d.id + '" style="display:none;">' +
            '    <div class="comments-list"><div class="comments-empty">Пока нет комментариев — напишите первый.</div></div>' +
            '    <form class="add-comment-form" data-post-id="' + d.id + '">' +
            '      <span class="comment-me">' +
                        (CFG.meAvatar
                            ? '<img src="' + esc(CFG.meAvatar) + '" alt="">'
                            : '<span class="comment-avatar-ph">' + esc(((CFG.meName || '?').charAt(0) || '?').toUpperCase()) + '</span>') +
            '      </span>' +
            '      <div class="comment-input-wrap">' +
            '        <input type="text" name="text" placeholder="Добавьте комментарий…" maxlength="500" autocomplete="off">' +
            '        <button type="submit" class="comment-send-btn" title="Отправить" disabled>' + PLANE_SVG_SM + '</button>' +
            '      </div>' +
            '    </form>' +
            '  </div>' +
            '</div>';
    }

    /* ====================== Инициализация ====================== */
    var feedMain = document.querySelector('.feed-main');

    function bindAll(root) {
        bindLikes(root);
        bindComments(root);
        bindCarouselDots(root);
        bindStoryBubbles(root);
    }

    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        if (lightbox && lightbox.style.display === 'flex') { closeLightbox(); return; }
        if (storyViewer && storyViewer.root.classList.contains('open')) storyViewer.close();
    });

    bindAll(document);
    refreshStoriesBar();
    document.querySelectorAll('.comments-block').forEach(function (b) { b.style.display = 'none'; });
})();
