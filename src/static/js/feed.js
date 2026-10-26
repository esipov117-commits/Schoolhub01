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

    function fullDate(iso) {
        return fmtDate(iso);
    }

    function timeAgo(iso) {
        var d = new Date(iso);
        if (isNaN(d)) return '';
        var sec = Math.floor((Date.now() - d.getTime()) / 1000);
        if (sec < 60) return 'только что';
        var min = Math.floor(sec / 60);
        if (min < 60) return min + ' мин.';
        var hr = Math.floor(min / 60);
        if (hr < 24) return hr + ' ч.';
        var days = Math.floor(hr / 24);
        if (days < 7) return days + ' дн.';
        var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
        return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear();
    }

    var LIKE_FILLED = '<svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor"><path d="M12 21s-.4-.3-1-.8C6.7 16.9 3 13.5 3 9.6 3 6.9 5.1 5 7.7 5c1.5 0 3 .7 3.9 1.9C12.5 5.7 14 5 15.5 5 18.1 5 20.2 6.9 20.2 9.6c0 3.9-3.7 7.3-8 10.6-.6.5-1 .8-1 .8z"/></svg>';
    var LIKE_OUTLINE = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 21s-.4-.3-1-.8C6.7 16.9 3 13.5 3 9.6 3 6.9 5.1 5 7.7 5c1.5 0 3 .7 3.9 1.9C12.5 5.7 14 5 15.5 5 18.1 5 20.2 6.9 20.2 9.6c0 3.9-3.7 7.3-8 10.6-.6.5-1 .8-1 .8z"/></svg>';
    var TRASH_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    var PENCIL_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
    var SEND_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h16M14 6l6 6-6 6"/></svg>';
    var BUBBLE_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
    var PLANE_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';
    var PLANE_SVG_SM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';
    var MORE_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
    var LINK_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"></path><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"></path></svg>';

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

    function viewsText(n) {
        n = n || 0;
        return n + ' ' + pluralRu(n, 'просмотр', 'просмотра', 'просмотров');
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
    function commentAvatarHtml(author, avatarUrl) {
        var profileUrl = CFG.profileBase + encodeURIComponent(author) + '/';
        var avatar = avatarUrl
            ? '<img src="' + esc(avatarUrl) + '" alt="" loading="lazy" decoding="async">'
            : '<span class="comment-avatar-ph">' + esc((author || '?').charAt(0).toUpperCase()) + '</span>';
        return '<a class="comment-avatar" href="' + profileUrl + '">' + avatar + '</a>';
    }

    function deleteBtnHtml(cid, postId, canDelete) {
        if (!canDelete) return '';
        return '<button type="button" class="delete-comment-btn" data-comment-id="' + cid +
            '" data-post-id="' + postId + '" title="Удалить">' + TRASH_SVG + '</button>';
    }

    function replyHtml(cid, author, avatarUrl, text, postId, canDelete) {
        var profileUrl = CFG.profileBase + encodeURIComponent(author) + '/';
        return '' +
            commentAvatarHtml(author, avatarUrl) +
            '<div class="comment-main">' +
            '  <div class="comment-line">' +
            '    <a class="comment-author" href="' + profileUrl + '">' + esc(author) + '</a>' +
            '    <span class="comment-text">' + esc(text) + '</span>' +
            '  </div>' +
            '  <div class="comment-meta"><span class="comment-time">только что</span></div>' +
            '</div>' +
            deleteBtnHtml(cid, postId, canDelete);
    }

    function commentHtml(cid, author, avatarUrl, text, postId, canDelete) {
        var profileUrl = CFG.profileBase + encodeURIComponent(author) + '/';
        return '' +
            '<div class="comment" id="comment-' + cid + '">' +
              commentAvatarHtml(author, avatarUrl) +
              '<div class="comment-main">' +
              '  <div class="comment-line">' +
              '    <a class="comment-author" href="' + profileUrl + '">' + esc(author) + '</a>' +
              '    <span class="comment-text">' + esc(text) + '</span>' +
              '  </div>' +
              '  <div class="comment-meta"><span class="comment-time">только что</span>' +
              '    <button type="button" class="reply-btn" data-comment-id="' + cid +
              '" data-author="' + esc(author) + '">Ответить</button>' +
              '  </div>' +
              '  <div class="comment-replies" id="replies-' + cid + '"></div>' +
              '</div>' +
              deleteBtnHtml(cid, postId, canDelete) +
            '</div>';
    }

    function syncShowMore(card) {
        if (!card) return;
        var block = card.querySelector('.comments-block');
        if (!block) return;
        var list = block.querySelector('.comments-list');
        var sm = block.querySelector('.show-more-comments');
        if (!list) return;
        var rootsTotal = parseInt(block.getAttribute('data-roots-total') || '0', 10);
        var rendered = list.querySelectorAll(':scope > .comment').length;
        if (rendered === 0 && rootsTotal === 0) {
            if (!list.querySelector('.comments-empty')) {
                list.innerHTML = '<div class="comments-empty">Пока нет комментариев — напишите первый.</div>';
            }
            block.classList.remove('expanded');
            if (sm) sm.style.display = 'none';
            return;
        }
        block.classList.add('expanded');
        if (sm) {
            var remaining = rootsTotal - rendered;
            if (remaining <= 0) {
                sm.style.display = 'none';
            } else {
                sm.style.display = '';
                sm.textContent = 'Показать ещё ' + commentsText(remaining);
            }
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
                var parentId = form.getAttribute('data-parent-id') || '';
                var fd = new FormData();
                fd.append('text', text);
                fd.append('parent_id', parentId);
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
                        if (d.parent_id) {
                            var wrap = document.getElementById('replies-' + d.parent_id);
                            if (!wrap) return;
                            div.className = 'comment reply';
                            div.id = 'comment-' + d.id;
                            div.innerHTML = replyHtml(d.id, d.author, d.author_avatar, d.text, id, true);
                            wrap.appendChild(div);
                            var root = document.getElementById('comment-' + d.parent_id);
                            if (root) root.style.display = '';
                        } else {
                            div.className = 'comment';
                            div.id = 'comment-' + d.id;
                            div.innerHTML = commentHtml(d.id, d.author, d.author_avatar, d.text, id, true);
                            list.appendChild(div);
                        }
                        input.value = '';
                        form.setAttribute('data-parent-id', '');
                        input.placeholder = 'Добавьте комментарий…';
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
        var replyBtn = e.target.closest && e.target.closest('.reply-btn');
        if (!replyBtn) return;
        var card = replyBtn.closest('.post-card');
        var form = card && card.querySelector('.add-comment-form');
        if (!form) return;
        var input = form.querySelector('input[name=text]');
        var author = replyBtn.getAttribute('data-author') || '';
        form.setAttribute('data-parent-id', replyBtn.getAttribute('data-comment-id') || '');
        if (input) {
            input.placeholder = 'Ответить ' + author + '…';
            input.focus();
        }
    });

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

    /* Показать ещё комментарии: догружаем порцию по AJAX */
    document.addEventListener('click', function (e) {
        var sm = e.target.closest && e.target.closest('.show-more-comments');
        if (!sm || sm._busy) return;
        var card = sm.closest('.post-card');
        var block = sm.closest('.comments-block');
        if (!card || !block) return;
        var list = block.querySelector('.comments-list');
        if (!list) return;
        var postId = card.getAttribute('data-post-id');
        var offset = parseInt(sm.getAttribute('data-offset') || '0', 10);
        sm._busy = true;
        var url = CFG.urls.loadComments.replace('/0/', '/' + postId + '/') + '?offset=' + offset;
        getJSON(url)
            .then(function (d) {
                sm._busy = false;
                if (!d || !Array.isArray(d.html) || !d.html.length) {
                    sm.style.display = 'none';
                    return;
                }
                var frag = document.createElement('div');
                frag.innerHTML = d.html.join('');
                while (frag.firstChild) list.appendChild(frag.firstChild);
                sm.setAttribute('data-offset', offset + d.html.length);
                block.classList.add('expanded');
                syncShowMore(card);
            })
            .catch(function () { sm._busy = false; toast('Ошибка сети'); });
    });

    /* Поделиться постом: нативный Web Share API, иначе — копирование ссылки */
    function copyShareUrl(url) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url)
                .then(function () { toast('Ссылка на публикацию скопирована'); })
                .catch(function () { toast(url); });
        } else {
            toast(url);
        }
    }

    function postUrl(id) {
        return location.origin + location.pathname + '#post-' + id;
    }

    document.addEventListener('click', function (e) {
        var btn = e.target.closest && e.target.closest('.share-post-btn');
        if (!btn) return;
        var url = postUrl(btn.getAttribute('data-post-id'));
        if (navigator.share) {
            navigator.share({ title: 'SchoolHub', text: 'Публикация в SchoolHub', url: url })
                .catch(function (err) {
                    if (!err || err.name !== 'AbortError') copyShareUrl(url);
                });
            return;
        }
        copyShareUrl(url);
    });

    document.addEventListener('click', function (e) {
        var btn = e.target.closest && e.target.closest('.copy-post-link');
        if (!btn) return;
        copyShareUrl(postUrl(btn.getAttribute('data-post-id')));
    });

    /* Меню «⋯» как в Threads: закрываем при клике вне пункта */
    function closePostMenus(except) {
        document.querySelectorAll('.post-more-wrap.open').forEach(function (wrap) {
            if (wrap === except) return;
            wrap.classList.remove('open');
            var card = wrap.closest('.post-card');
            if (card) card.classList.remove('menu-open');
            var btn = wrap.querySelector('.post-more-btn');
            if (btn) btn.setAttribute('aria-expanded', 'false');
        });
    }

    document.addEventListener('click', function (e) {
        var toggle = e.target.closest && e.target.closest('.post-more-btn');
        if (toggle) {
            var wrap = toggle.closest('.post-more-wrap');
            var willOpen = !wrap.classList.contains('open');
            var card = wrap.closest('.post-card');
            closePostMenus(wrap);
            wrap.classList.remove('menu-up');
            wrap.classList.toggle('open', willOpen);
            if (card) card.classList.toggle('menu-open', willOpen);
            toggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
            if (willOpen) {
                var menu = wrap.querySelector('.post-more-menu');
                if (menu && menu.getBoundingClientRect().bottom > window.innerHeight - 12) {
                    wrap.classList.add('menu-up');
                }
            }
            return;
        }
        if (e.target.closest && e.target.closest('.post-more-menu')) {
            if (e.target.closest('.post-menu-item')) closePostMenus();
            return;
        }
        closePostMenus();
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closePostMenus();
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
    var confirmAction = null;
    var confirmCancelAction = null;

    function confirmOverlayEl() { return document.getElementById('confirmOverlay'); }

    function openConfirm(message, action, cancel) {
        confirmAction = action;
        confirmCancelAction = cancel || null;
        var textEl = document.getElementById('confirmText');
        if (textEl && message) textEl.textContent = message;
        var ov = confirmOverlayEl();
        if (ov) ov.style.display = 'flex';
    }
    function closeConfirm(runCancel) {
        var cb = confirmCancelAction;
        confirmAction = null;
        confirmCancelAction = null;
        var ov = confirmOverlayEl();
        if (ov) ov.style.display = 'none';
        if (runCancel && cb) cb();
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
            dots.forEach(function (dot, idx) {
                dot.style.cursor = 'pointer';
                dot.addEventListener('click', function () {
                    track.scrollTo({ left: idx * track.clientWidth, behavior: 'smooth' });
                });
            });
            track.addEventListener('scroll', function () {
                var i = Math.round(track.scrollLeft / Math.max(track.clientWidth, 1));
                dots.forEach(function (d, idx) { d.classList.toggle('active', idx === i); });
                track.querySelectorAll('video').forEach(function (v) {
                    if (Math.abs(v.offsetLeft - i * track.clientWidth) > 4) {
                        try { v.pause(); } catch (err) {}
                    }
                });
            }, { passive: true });
        });
    }

    /* ====================== Бесконечная прокрутка ====================== */
    var feedPosts = null;
    var feedLoading = null;
    var nextPage = 2;
    var loadingPosts = false;
    var noMorePosts = false;

    function feedSkeletonEl() {
        return feedLoading ? feedLoading.querySelector('.feed-skeleton') : null;
    }

    function setFeedLoading(on) {
        var sk = feedSkeletonEl();
        if (sk) sk.style.display = on ? 'block' : 'none';
    }

    function loadMorePosts() {
        if (loadingPosts || noMorePosts || !feedPosts) return;
        loadingPosts = true;
        setFeedLoading(true);
        getJSON(CFG.urls.feed + '?page=' + nextPage)
            .then(function (d) {
                loadingPosts = false;
                setFeedLoading(false);
                if (!d || !Array.isArray(d.html)) { noMorePosts = true; return; }
                var frag = document.createElement('div');
                frag.innerHTML = d.html.join('');
                while (frag.firstChild) feedPosts.appendChild(frag.firstChild);
                nextPage += 1;
                noMorePosts = !d.has_next;
                bindAll(feedPosts);
                if (window.observePostViews) window.observePostViews(feedPosts);
                if (window.__drainPostViews) window.__drainPostViews();
            })
            .catch(function () { loadingPosts = false; setFeedLoading(false); });
    }

    function initInfiniteScroll() {
        feedPosts = document.getElementById('feedPosts');
        feedLoading = document.getElementById('feedLoading');
        nextPage = 2;
        loadingPosts = false;
        var cfg = window.FEED_CONFIG || {};
        noMorePosts = !(cfg.hasMore === true || cfg.hasMore === undefined);
        if (window.__feedObserver) { window.__feedObserver.disconnect(); window.__feedObserver = null; }
        if (feedLoading && 'IntersectionObserver' in window) {
            window.__feedObserver = new IntersectionObserver(function (entries) {
                entries.forEach(function (en) { if (en.isIntersecting) loadMorePosts(); });
            }, { rootMargin: '600px' });
            window.__feedObserver.observe(feedLoading);
        }
    }

    /* ====================== Лайтбокс ====================== */
    var lightboxIndex = 0;
    var lightboxItems = [];

    function lightboxEl() { return document.getElementById('lightboxOverlay'); }
    function lightboxTrackEl() { return document.getElementById('lightboxTrack'); }

    function updateLightboxCounter() {
        var el = document.getElementById('lightboxCounter');
        var track = lightboxTrackEl();
        if (!el || !track || !lightboxItems.length) return;
        var i = Math.round(track.scrollLeft / Math.max(track.clientWidth, 1));
        el.textContent = lightboxItems.length > 1 ? ((i + 1) + ' / ' + lightboxItems.length) : '';
    }

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
        var track = lightboxTrackEl();
        if (!track) return;
        track.innerHTML = '';
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
            track.appendChild(wrap);
        });
    }

    function openLightbox(items, startIndex) {
        var lb = lightboxEl();
        var track = lightboxTrackEl();
        if (!lb || !track || !items.length) return;
        lightboxItems = items;
        renderLightbox(items);
        lb.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        lightboxIndex = startIndex || 0;
        requestAnimationFrame(function () {
            track.scrollLeft = lightboxIndex * track.clientWidth;
            updateLightboxCounter();
        });
    }

    function closeLightbox() {
        var lb = lightboxEl();
        var track = lightboxTrackEl();
        if (!lb) return;
        if (track) {
            track.querySelectorAll('video').forEach(function (v) { v.pause(); });
            track.innerHTML = '';
        }
        lb.style.display = 'none';
        lightboxItems = [];
        document.body.style.overflow = '';
    }

    function lightboxStep(dir) {
        var track = lightboxTrackEl();
        if (track) track.scrollBy({ left: dir * track.clientWidth, behavior: 'smooth' });
    }

    document.addEventListener('scroll', updateLightboxCounter, true);
    document.addEventListener('dblclick', function (e) {
        var img = e.target.closest && e.target.closest('#lightboxTrack img');
        if (img) img.classList.toggle('lightbox-zoom');
    });

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
    var storyFile = null;
    var storyPreviewUrl = null;
    var storyFit = 'contain';
    var storyBackground = 'blur';
    var storyFocusX = 50;
    var storyFocusY = 50;
    var storyZoom = 100;

    function storyModalEl() { return document.getElementById('storyCreateModal'); }
    function storyInputEl() { return document.getElementById('storyFileInput'); }
    function storyPickerEl() { return document.getElementById('storyPickerArea'); }
    function storyPreviewEl() { return document.getElementById('storyPreview'); }
    function storyFrameEl() { return document.getElementById('storyPreviewFrame'); }
    function storyPreviewBgEl() { return document.getElementById('storyPreviewBg'); }
    function storyPreviewMediaEl() { return document.getElementById('storyPreviewMedia'); }
    function storyPreviewCaptionEl() { return document.getElementById('storyPreviewCaption'); }
    function storyPreviewHintEl() { return document.getElementById('storyPreviewHint'); }
    function storyBackgroundControlsEl() { return document.getElementById('storyBackgroundControls'); }
    function storyZoomRangeEl() { return document.getElementById('storyZoomRange'); }
    function storyCaptionEl() { return document.getElementById('storyCaption'); }
    function storySubmitEl() { return document.getElementById('storySubmitBtn'); }
    function storyErrorEl() { return document.getElementById('storyError'); }

    function storyClamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function storyNumber(value, fallback, min, max) {
        var number = parseInt(value, 10);
        if (!isFinite(number)) number = fallback;
        return storyClamp(number, min, max);
    }

    function setStoryError(msg) {
        var el = storyErrorEl();
        if (!el) return;
        el.textContent = msg || '';
        el.style.display = msg ? 'block' : 'none';
    }

    function releaseStoryPreviewUrl() {
        if (storyPreviewUrl) {
            URL.revokeObjectURL(storyPreviewUrl);
            storyPreviewUrl = null;
        }
    }

    function createStoryPreviewMedia(isVideo, url, muted) {
        var el;
        if (isVideo) {
            el = document.createElement('video');
            el.src = url;
            el.muted = !!muted;
            el.loop = true;
            el.autoplay = true;
            el.playsInline = true;
            var play = el.play();
            if (play && play.catch) play.catch(function () {});
        } else {
            el = document.createElement('img');
            el.src = url;
            el.alt = '';
        }
        return el;
    }

    function applyStoryLayout() {
        var frame = storyFrameEl();
        if (!frame) return;
        frame.classList.toggle('fit-contain', storyFit === 'contain');
        frame.classList.toggle('fit-cover', storyFit === 'cover');
        frame.classList.toggle('bg-blur', storyBackground === 'blur');
        frame.classList.toggle('bg-black', storyBackground === 'black');
        frame.style.setProperty('--story-focus-x', storyFocusX + '%');
        frame.style.setProperty('--story-focus-y', storyFocusY + '%');
        frame.style.setProperty('--story-zoom', String(storyZoom / 100));

        var fitButtons = document.querySelectorAll('#storyFitModes button');
        fitButtons.forEach(function (btn) {
            btn.classList.toggle('active', btn.getAttribute('data-fit') === storyFit);
        });
        var bgButtons = document.querySelectorAll('#storyBackgroundModes button');
        bgButtons.forEach(function (btn) {
            btn.classList.toggle('active', btn.getAttribute('data-background') === storyBackground);
        });

        var bgControls = storyBackgroundControlsEl();
        if (bgControls) bgControls.style.display = storyFit === 'contain' ? '' : 'none';

        var bg = storyPreviewBgEl();
        var showBg = storyFit === 'contain' && storyBackground === 'blur';
        if (bg) bg.style.display = showBg ? 'block' : 'none';
        var bgVideo = bg && bg.querySelector('video');
        if (bgVideo) {
            if (showBg) {
                var play = bgVideo.play();
                if (play && play.catch) play.catch(function () {});
            } else {
                bgVideo.pause();
            }
        }

        var zoom = storyZoomRangeEl();
        if (zoom && String(zoom.value) !== String(storyZoom)) zoom.value = storyZoom;

        var hint = storyPreviewHintEl();
        if (hint) hint.classList.toggle('muted', !(storyFit === 'cover' || storyZoom > 100));
    }

    function renderStoryPreview() {
        var preview = storyPreviewEl();
        var picker = storyPickerEl();
        var submit = storySubmitEl();
        var media = storyPreviewMediaEl();
        var bg = storyPreviewBgEl();
        if (!storyFile) {
            releaseStoryPreviewUrl();
            if (preview) { preview.style.display = 'none'; }
            if (media) media.innerHTML = '';
            if (bg) { bg.innerHTML = ''; bg.style.display = 'none'; }
            var caption = storyPreviewCaptionEl();
            if (caption) { caption.textContent = ''; caption.style.display = 'none'; }
            if (picker) picker.style.display = 'flex';
            if (submit) submit.disabled = true;
            return;
        }

        releaseStoryPreviewUrl();
        storyPreviewUrl = URL.createObjectURL(storyFile);
        var isVideo = storyFile.type.indexOf('video/') === 0;
        if (media) {
            media.innerHTML = '';
            var fg = createStoryPreviewMedia(isVideo, storyPreviewUrl, true);
            fg.className = 'story-frame-media-el';
            media.appendChild(fg);
        }
        if (bg) {
            bg.innerHTML = '';
            var bgMedia = createStoryPreviewMedia(isVideo, storyPreviewUrl, true);
            bgMedia.className = 'story-frame-bg-media';
            bg.appendChild(bgMedia);
        }

        var cap = storyCaptionEl();
        var previewCaption = storyPreviewCaptionEl();
        if (previewCaption) {
            var text = cap ? cap.value.trim() : '';
            previewCaption.textContent = text;
            previewCaption.style.display = text ? 'block' : 'none';
        }

        if (preview) preview.style.display = 'flex';
        if (picker) picker.style.display = 'none';
        if (submit) submit.disabled = false;
        applyStoryLayout();
    }

    function openStoryModal() {
        var m = storyModalEl();
        if (!m) return;
        storyFile = null;
        storyFit = 'contain';
        storyBackground = 'blur';
        storyFocusX = 50;
        storyFocusY = 50;
        storyZoom = 100;
        releaseStoryPreviewUrl();
        var inp = storyInputEl();
        if (inp) inp.value = '';
        var cap = storyCaptionEl();
        if (cap) cap.value = '';
        setStoryError('');
        renderStoryPreview();
        var picker = storyPickerEl();
        if (picker) picker.style.display = 'flex';
        m.showModal();
    }

    function closeStoryModal() {
        releaseStoryPreviewUrl();
        storyFile = null;
        var m = storyModalEl();
        if (m && m.open) m.close();
    }

    function storyFileChange(input) {
        storyFile = input && input.files && input.files[0] ? input.files[0] : null;
        storyFocusX = 50;
        storyFocusY = 50;
        storyZoom = 100;
        setStoryError('');
        renderStoryPreview();
    }

    function submitStory() {
        if (!storyFile) return;
        var submit = storySubmitEl();
        if (submit) submit.disabled = true;
        var fd = new FormData();
        fd.append('media', storyFile);
        fd.append('fit_mode', storyFit);
        fd.append('background_mode', storyBackground);
        fd.append('focus_x', String(Math.round(storyFocusX)));
        fd.append('focus_y', String(Math.round(storyFocusY)));
        fd.append('zoom', String(storyZoom));
        var cap = storyCaptionEl();
        if (cap && cap.value.trim()) fd.append('caption', cap.value.trim());
        postForm(CFG.urls.uploadStory, fd)
            .then(function (res) {
                if (!res.ok) {
                    setStoryError(res.data.error || 'Не удалось загрузить');
                    if (submit) submit.disabled = false;
                    return;
                }
                closeStoryModal();
                toast('История опубликована');
                var inp = storyInputEl();
                if (inp) inp.value = '';
                renderStoryPreview();
                refreshStoriesBar();
            })
            .catch(function () {
                setStoryError('Ошибка сети');
                if (submit) submit.disabled = false;
            });
    }

    function bindStoryComposer() {
        var modal = storyModalEl();
        if (modal && !modal._storyCloseBound) {
            modal._storyCloseBound = true;
            modal.addEventListener('close', function () {
                releaseStoryPreviewUrl();
                storyFile = null;
            });
        }

        var frame = storyFrameEl();
        if (!frame || frame._storyDragBound) return;
        frame._storyDragBound = true;
        var drag = null;

        frame.addEventListener('pointerdown', function (e) {
            if (!storyFile || (e.target && e.target.closest && e.target.closest('button'))) return;
            drag = {
                id: e.pointerId,
                x: e.clientX,
                y: e.clientY,
                focusX: storyFocusX,
                focusY: storyFocusY
            };
            frame.classList.add('dragging');
            try { frame.setPointerCapture(e.pointerId); } catch (err) {}
            e.preventDefault();
        });

        frame.addEventListener('pointermove', function (e) {
            if (!drag || e.pointerId !== drag.id) return;
            var rect = frame.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            var dx = e.clientX - drag.x;
            var dy = e.clientY - drag.y;
            storyFocusX = storyClamp(drag.focusX - (dx / rect.width) * 100, 0, 100);
            storyFocusY = storyClamp(drag.focusY - (dy / rect.height) * 100, 0, 100);
            applyStoryLayout();
        });

        function endDrag(e) {
            if (!drag) return;
            drag = null;
            frame.classList.remove('dragging');
            try { frame.releasePointerCapture(e.pointerId); } catch (err) {}
        }

        frame.addEventListener('pointerup', endDrag);
        frame.addEventListener('pointercancel', endDrag);

        frame.addEventListener('wheel', function (e) {
            if (!storyFile || !(e.ctrlKey || e.metaKey)) return;
            e.preventDefault();
            storyZoom = storyClamp(storyZoom - Math.sign(e.deltaY) * 5, 100, 250);
            applyStoryLayout();
        }, { passive: false });
    }

    /* ====================== Просмотрщик историй ====================== */
    var viewerTimer = null;

    function stopViewerTimer() {
        clearTimeout(viewerTimer);
        viewerTimer = null;
    }

    function StoryViewer() {
        this.groups = [];
        this.groupIndex = -1;
        this.group = null;
        this.index = 0;
        this.isOwn = false;
        this.muted = false;
        this._customMedia = null;
        this._ignoreTap = false;
        this.bindEls();
    }

    /* Перечитывает элементы DOM: после SPA-навигации старые ссылки протухают */
    StoryViewer.prototype.bindEls = function () {
        this.root = document.getElementById('storyViewer');
        this.track = document.getElementById('storyProgress');
        this.authorEl = document.getElementById('viewer-author');
        this.avatarEl = document.getElementById('viewer-avatar');
        this.captionEl = document.getElementById('viewer-caption');
        this.mediaBox = this.root ? this.root.querySelector('.story-viewer-media') : null;
        this.deleteBtn = document.getElementById('storyDeleteBtn');
        this.statsBtn = document.getElementById('storyStatsBtn');
        this.likeBtn = document.getElementById('storyLikeBtn');
        this.soundBtn = document.getElementById('storySoundBtn');
        this.bindGestures();
    };

    /* Свайпы влево/вправо по области просмотра */
    StoryViewer.prototype.bindGestures = function () {
        var self = this;
        if (!this.root || this.root._storyGesturesBound) return;
        this.root._storyGesturesBound = true;
        var startX = 0;
        var startY = 0;
        var tracking = false;

        this.root.addEventListener('touchstart', function (e) {
            if (e.touches.length !== 1) return;
            var target = e.target;
            if (target && target.closest && target.closest('.story-close, .viewer-icon-btn')) return;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            tracking = true;
        }, { passive: true });

        this.root.addEventListener('touchend', function (e) {
            if (!tracking) return;
            tracking = false;
            var touch = e.changedTouches && e.changedTouches[0];
            if (!touch) return;
            var dx = touch.clientX - startX;
            var dy = touch.clientY - startY;
            if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
            self._ignoreTap = true;
            setTimeout(function () { self._ignoreTap = false; }, 350);
            if (dx < 0) self.next();
            else self.prev();
        }, { passive: true });
    };

    StoryViewer.prototype.open = function (groups, startIndex) {
        this.bindEls();
        if (!this.root) return;
        this.groups = (groups || []).filter(function (g) {
            return g && g.items && g.items.length;
        });
        if (!this.groups.length) return;
        var idx = typeof startIndex === 'number' ? startIndex : 0;
        if (idx < 0 || idx >= this.groups.length) idx = 0;
        this.root.classList.add('open');
        document.body.style.overflow = 'hidden';
        this.activateGroup(idx, 0);
    };

    StoryViewer.prototype.activateGroup = function (groupIndex, itemIndex, direction) {
        var group = this.groups[groupIndex];
        if (!group || !group.items.length) return this.close();
        this.groupIndex = groupIndex;
        this.group = group;
        this.index = 0;
        this.authorEl.textContent = group.author_name;
        if (group.author_avatar) {
            this.avatarEl.src = group.author_avatar;
            this.avatarEl.style.display = 'block';
        } else {
            this.avatarEl.removeAttribute('src');
            this.avatarEl.style.display = 'none';
        }
        var isOwn = String(group.author_id) === String(CFG.meId);
        this.isOwn = isOwn;
        var canDelete = isOwn || CFG.isModerator;
        this.deleteBtn.style.display = canDelete ? 'flex' : 'none';
        this.statsBtn.style.display = isOwn ? 'flex' : 'none';
        this.likeBtn.style.display = isOwn ? 'none' : 'flex';
        this.show(itemIndex || 0, direction || 0);
    };

    StoryViewer.prototype.nextGroup = function (direction) {
        if (!this.groups) return this.close();
        for (var i = this.groupIndex + 1; i < this.groups.length; i++) {
            if (this.groups[i].items.length) {
                return this.activateGroup(i, 0, direction == null ? 1 : direction);
            }
        }
        this.close();
    };

    StoryViewer.prototype.prevGroup = function (direction) {
        if (!this.groups) return;
        for (var i = this.groupIndex - 1; i >= 0; i--) {
            if (this.groups[i].items.length) {
                return this.activateGroup(
                    i,
                    this.groups[i].items.length - 1,
                    direction == null ? -1 : direction
                );
            }
        }
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
                        var gi = self.groups.indexOf(self.group);
                        if (gi !== -1) self.groups.splice(gi, 1);
                        if (gi === -1 || gi >= self.groups.length) {
                            self.close();
                        } else {
                            self.activateGroup(gi, 0);
                        }
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
        this.groups = null;
        this.groupIndex = -1;
    };

    StoryViewer.prototype.clearMedia = function () {
        if (this._customMediaBg) {
            try { this._customMediaBg.pause(); } catch (e) {}
        }
        if (this._customMedia) {
            try { this._customMedia.pause(); } catch (e) {}
        }
        if (this._customMediaStack && this._customMediaStack.parentNode) {
            this._customMediaStack.parentNode.removeChild(this._customMediaStack);
        }
        this._customMedia = null;
        this._customMediaBg = null;
        this._customMediaStack = null;
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

    StoryViewer.prototype.updateLikeBtn = function () {
        if (!this.likeBtn || !this.group) return;
        var item = this.group.items[this.index];
        if (!item) return;
        this.likeBtn.classList.toggle('liked', !!item.liked_by_me);
        this.likeBtn.title = item.liked_by_me ? 'Не нравится' : 'Нравится';
    };

    StoryViewer.prototype.toggleLike = function () {
        var self = this;
        if (!this.group) return;
        var item = this.group.items[this.index];
        if (!item) return;
        if (this.likeBtn._busy) return;
        this.likeBtn._busy = true;
        var url = CFG.urls.likeStory.replace('/0/', '/' + item.id + '/');
        postForm(url, new FormData())
            .then(function (res) {
                self.likeBtn._busy = false;
                if (!res.ok) {
                    if (res.data && res.data.error) toast(res.data.error);
                    return;
                }
                item.liked_by_me = res.data.liked;
                item.likes_count = res.data.likes_count;
                self.updateLikeBtn();
            })
            .catch(function () {
                self.likeBtn._busy = false;
                toast('Ошибка сети');
            });
    };

    StoryViewer.prototype.openStats = function () {
        var self = this;
        if (!this.group) return;
        var item = this.group.items[this.index];
        if (!item) return;
        var modal = document.getElementById('storyStatsModal');
        var summary = document.getElementById('storyStatsSummary');
        var list = document.getElementById('storyStatsList');
        if (!modal) return;
        summary.textContent = 'Загрузка…';
        list.innerHTML = '';
        modal.showModal();
        var url = CFG.urls.storyStats.replace('/0/', '/' + item.id + '/');
        getJSON(url)
            .then(function (d) {
                summary.textContent = 'Лайков: ' + d.likes_count + ' · Просмотров: ' + d.viewers.length;
                list.innerHTML = '';
                if (!d.viewers.length) {
                    list.innerHTML = '<div class="story-stats-empty">Просмотров пока нет</div>';
                    return;
                }
                d.viewers.forEach(function (v) {
                    var row = document.createElement('div');
                    row.className = 'story-stats-row';
                    var av = document.createElement('img');
                    av.className = 'story-stats-avatar';
                    if (v.avatar) {
                        av.src = v.avatar;
                    } else {
                        av.alt = v.username.charAt(0).toUpperCase();
                        av.className += ' story-stats-avatar-ph';
                    }
                    var name = document.createElement('span');
                    name.className = 'story-stats-name';
                    name.textContent = v.username;
                    var time = document.createElement('span');
                    time.className = 'story-stats-time';
                    time.textContent = new Date(v.viewed_at).toLocaleString();
                    row.appendChild(av);
                    row.appendChild(name);
                    row.appendChild(time);
                    list.appendChild(row);
                });
            })
            .catch(function () {
                summary.textContent = 'Не удалось загрузить статистику';
            });
    };

    StoryViewer.prototype.show = function (i, direction) {
        if (!this.group) return;
        if (i < 0 || i >= this.group.items.length) return;
        stopViewerTimer();
        this.index = i;
        var item = this.group.items[i];
        this.updateLikeBtn();
        markStoryViewed(this.group, item);
        var isVideo = item.type === 'video';
        this.clearMedia();
        this.renderProgress(!isVideo);
        if (this.soundBtn) this.soundBtn.style.display = isVideo ? 'flex' : 'none';

        var self = this;
        var fitMode = item.fit_mode === 'cover' ? 'cover' : 'contain';
        var backgroundMode = item.background_mode === 'black' ? 'black' : 'blur';
        var focusX = storyNumber(item.focus_x, 50, 0, 100);
        var focusY = storyNumber(item.focus_y, 50, 0, 100);
        var zoom = storyNumber(item.zoom, 100, 100, 250);
        var stack = document.createElement('div');
        stack.className = 'viewer-media-stack fit-' + fitMode + ' bg-' + backgroundMode;
        stack.style.setProperty('--story-focus-x', focusX + '%');
        stack.style.setProperty('--story-focus-y', focusY + '%');
        stack.style.setProperty('--story-zoom', String(zoom / 100));

        var bg = null;
        if (fitMode === 'contain' && backgroundMode === 'blur') {
            if (isVideo) {
                bg = document.createElement('video');
                bg.src = item.url;
                bg.muted = true;
                bg.loop = true;
                bg.autoplay = true;
                bg.playsInline = true;
                var bgPlay = bg.play();
                if (bgPlay && bgPlay.catch) bgPlay.catch(function () {});
            } else {
                bg = document.createElement('img');
                bg.src = item.url;
                bg.alt = '';
            }
            bg.className = 'viewer-media-bg';
            stack.appendChild(bg);
        }

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
        el.className = 'viewer-actual-media viewer-media-fg';
        if (direction > 0) el.classList.add('story-slide-next');
        else if (direction < 0) el.classList.add('story-slide-prev');
        stack.appendChild(el);
        this.mediaBox.appendChild(stack);
        this._customMedia = el;
        this._customMediaBg = bg;
        this._customMediaStack = stack;

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

    StoryViewer.prototype.next = function () {
        if (!this.group) return;
        if (this.index + 1 < this.group.items.length) return this.show(this.index + 1, 1);
        this.nextGroup(1);
    };

    StoryViewer.prototype.prev = function () {
        if (!this.group) return;
        if (this.index > 0) return this.show(this.index - 1, -1);
        this.prevGroup(-1);
    };

    var storyViewer = new StoryViewer();

    function closeStoryStatsModal() {
        var m = document.getElementById('storyStatsModal');
        if (m && m.open) m.close();
    }

    function closePostLikesModal() {
        var m = document.getElementById('postLikesModal');
        if (m && m.open) m.close();
    }

    function openPostLikes(postId) {
        var modal = document.getElementById('postLikesModal');
        var summary = document.getElementById('postLikesSummary');
        var list = document.getElementById('postLikesList');
        if (!modal) return;
        summary.textContent = 'Загрузка…';
        list.innerHTML = '';
        modal.showModal();
        getJSON(CFG.urls.postLikes.replace('/0/', '/' + postId + '/'))
            .then(function (d) {
                if (!d || d.error) {
                    summary.textContent = (d && d.error) || 'Не удалось загрузить';
                    return;
                }
                summary.textContent = likesText(d.likes_count);
                list.innerHTML = '';
                if (!d.likers || !d.likers.length) {
                    list.innerHTML = '<div class="story-stats-empty">Пока нет отметок «Нравится»</div>';
                    return;
                }
                d.likers.forEach(function (u) {
                    var row = document.createElement('div');
                    row.className = 'story-stats-row';
                    var av = document.createElement('img');
                    av.className = 'story-stats-avatar';
                    if (u.avatar) {
                        av.src = u.avatar;
                        av.alt = u.username;
                    } else {
                        av.className += ' story-stats-avatar-ph';
                        av.alt = (u.username || '?').charAt(0).toUpperCase();
                    }
                    var name = document.createElement('span');
                    name.className = 'story-stats-name';
                    name.textContent = u.username;
                    var time = document.createElement('span');
                    time.className = 'story-stats-time';
                    time.textContent = u.liked_at ? new Date(u.liked_at).toLocaleString() : '';
                    row.appendChild(av);
                    row.appendChild(name);
                    row.appendChild(time);
                    list.appendChild(row);
                });
            })
            .catch(function () { summary.textContent = 'Не удалось загрузить'; });
    }

    function openStoriesFor(authorId, authorName, authorAvatar) {
        getJSON(CFG.urls.activeStories).then(function (d) {
            var groups = (d && d.stories) || [];
            var me = String(CFG.meId);
            var own = [];
            var rest = [];
            groups.forEach(function (g) {
                if (String(g.author_id) === me) own.push(g);
                else rest.push(g);
            });
            var ordered = own.concat(rest);
            var start = -1;
            ordered.forEach(function (g, i) {
                if (String(g.author_id) === String(authorId)) start = i;
            });
            if (start === -1 || !ordered[start].items.length) {
                toast('Истории недоступны');
                return;
            }
            storyViewer.open(ordered, start);
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
                av.className = 'story-avatar ' + ((!isMe && g.viewed) ? 'viewed' : 'has-story');
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

    /* ====================== Отметка «просмотрено» ====================== */
    function updateStoryBubble(group) {
        if (!group) return;
        var allViewed = group.items.every(function (it) { return it.viewed; });
        group.viewed = allViewed;
        var btn = document.querySelector('.story-item[data-author-id="' + group.author_id + '"]');
        if (!btn) return;
        var av = btn.querySelector('.story-avatar');
        if (!av) return;
        av.classList.toggle('viewed', allViewed);
        av.classList.toggle('has-story', !allViewed);
    }

    function markStoryViewed(group, item) {
        if (!group || !item) return;
        if (String(group.author_id) === String(CFG.meId)) return;
        var changed = false;
        if (!item.viewed) {
            item.viewed = true;
            changed = true;
            if (CFG.urls.viewStory) {
                postForm(CFG.urls.viewStory.replace('/0/', '/' + item.id + '/'), new FormData())
                    .catch(function () {});
            }
        }
        if (changed) updateStoryBubble(group);
    }

    /* ====================== Создание поста (стиль Threads) ====================== */
    var postFiles = [];
    var postLayout = 'carousel';
    var postStep = 'edit';

    function postModalEl() { return document.getElementById('postCreateModal'); }
    function postInputEl() { return document.getElementById('postFileInput'); }
    function postPickerEl() { return document.getElementById('postPickerArea'); }
    function postPreviewEl() { return document.getElementById('postPreview'); }
    function postPreviewCardEl() { return document.getElementById('postPreviewCard'); }
    function addMoreEl() { return document.getElementById('addMoreMediaBtn'); }
    function viewModeEl() { return document.getElementById('postViewMode'); }
    function captionEl() { return document.getElementById('postCaption'); }
    function postSubmitEl() { return document.getElementById('postSubmitBtn'); }
    function postPreviewBtnEl() { return document.getElementById('postPreviewBtn'); }
    function postEditStepEl() { return document.getElementById('postEditStep'); }
    function postPreviewStepEl() { return document.getElementById('postPreviewStep'); }
    function postBackBtnEl() { return document.getElementById('postBackBtn'); }
    function postCancelBtnEl() { return document.getElementById('postCancelBtn'); }
    function postTitleEl() { return document.getElementById('postModalTitle'); }
    function postErrorEl() { return document.getElementById('postError'); }

    function setPostError(msg) {
        var el = postErrorEl();
        if (!el) return;
        el.textContent = msg || '';
        el.style.display = msg ? 'block' : 'none';
    }

    function resetPostModal() {
        postFiles = [];
        postLayout = 'carousel';
        var inp = postInputEl();
        if (inp) inp.value = '';
        var cap = captionEl();
        if (cap) cap.value = '';
        setPostError('');
        showPostStep('edit');
        renderPostModal();
    }

    function showPostStep(step) {
        postStep = step === 'preview' ? 'preview' : 'edit';
        var isPreview = postStep === 'preview';
        var editStep = postEditStepEl();
        var previewStep = postPreviewStepEl();
        var previewBtn = postPreviewBtnEl();
        var submit = postSubmitEl();
        var backBtn = postBackBtnEl();
        var cancelBtn = postCancelBtnEl();
        var title = postTitleEl();

        if (editStep) editStep.style.display = isPreview ? 'none' : 'flex';
        if (previewStep) previewStep.style.display = isPreview ? 'flex' : 'none';
        if (previewBtn) previewBtn.style.display = isPreview ? 'none' : '';
        if (submit) submit.style.display = isPreview ? '' : 'none';
        if (backBtn) backBtn.style.display = isPreview ? '' : 'none';
        if (cancelBtn) cancelBtn.style.display = isPreview ? 'none' : '';
        if (title) title.textContent = isPreview ? 'Предпросмотр' : 'Новая публикация';
        if (isPreview) renderPostPreviewCard();
        syncPostSubmit();
    }

    function syncPostSubmit() {
        var cap = captionEl();
        var hasText = cap ? (cap.value || '').trim() : false;
        var hasContent = !!postFiles.length || !!hasText;
        var previewBtn = postPreviewBtnEl();
        if (previewBtn) previewBtn.disabled = !hasContent;
        var submit = postSubmitEl();
        if (submit) submit.disabled = !hasContent;
    }

    function renderPostModal() {
        var hasFiles = postFiles.length > 0;
        var picker = postPickerEl();
        var addMore = addMoreEl();
        var vm = viewModeEl();
        var preview = postPreviewEl();

        if (picker) picker.style.display = hasFiles ? 'none' : 'flex';
        if (addMore) addMore.style.display = hasFiles ? 'inline-flex' : 'none';
        if (vm) {
            vm.style.display = hasFiles && postFiles.length > 1 ? 'flex' : 'none';
            vm.querySelectorAll('button').forEach(function (b) {
                b.classList.toggle('active', b.getAttribute('data-mode') === postLayout);
            });
        }

        if (preview) {
            preview.innerHTML = '';
            preview.style.display = hasFiles ? 'grid' : 'none';
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
                rm.setAttribute('data-index', idx);
                rm.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
                cell.appendChild(rm);
                preview.appendChild(cell);
            });
        }

        syncPostSubmit();
    }

    /* Предпросмотр: как пост будет выглядеть в ленте */
    function renderPostPreviewCard() {
        var card = postPreviewCardEl();
        if (!card) return;
        var cfg = window.FEED_CONFIG || {};
        var name = cfg.meName || '';
        var avatar = cfg.meAvatar || '';
        var avatarHtml = avatar
            ? '<img src="' + esc(avatar) + '" alt="">'
            : '<span class="comment-avatar-ph">' + esc((name || '?').charAt(0).toUpperCase()) + '</span>';

        var cap = captionEl();
        var text = cap ? (cap.value || '') : '';

        var mediaHtml = '';
        if (postFiles.length) {
            if (postLayout === 'grid' && postFiles.length > 1) {
                var gridItems = postFiles.map(function (f) {
                    var url = URL.createObjectURL(f);
                    return f.type.startsWith('video/')
                        ? '<video src="' + url + '" class="grid-media" muted playsinline></video>'
                        : '<img src="' + url + '" class="grid-media" alt="">';
                });
                mediaHtml = '<div class="post-grid">' + gridItems.join('') + '</div>';
            } else {
                var items = postFiles.map(function (f) {
                    var url = URL.createObjectURL(f);
                    return f.type.startsWith('video/')
                        ? '<video src="' + url + '" class="carousel-img" muted playsinline></video>'
                        : '<img src="' + url + '" class="carousel-img" alt="">';
                });
                mediaHtml = '<div class="post-carousel"><div class="carousel-track">' + items.join('') + '</div>';
                if (items.length > 1) {
                    mediaHtml += '<div class="carousel-dots">' + items.map(function (_, i) {
                        return '<span class="carousel-dot' + (i === 0 ? ' active' : '') + '"></span>';
                    }).join('') + '</div>';
                }
                mediaHtml += '</div>';
            }
        }

        card.innerHTML =
            '<div class="post-avatar-col">' +
              '<span class="post-avatar-link"><span class="post-avatar">' + avatarHtml + '</span></span>' +
            '</div>' +
            '<div class="post-main">' +
              '<div class="post-head-row">' +
                '<div class="post-head-left">' +
                  '<span class="post-author">' + esc(name) + '</span>' +
                  '<span class="post-time">сейчас</span>' +
                '</div>' +
              '</div>' +
              (text.trim() ? '<div class="post-content">' + esc(text) + '</div>' : '') +
              (mediaHtml ? '<div class="post-media">' + mediaHtml + '</div>' : '') +
              '<div class="post-actions">' +
                '<span class="preview-action">' + LIKE_OUTLINE + '</span>' +
                '<span class="preview-action">' + BUBBLE_SVG + '</span>' +
                '<span class="preview-action">' + PLANE_SVG + '</span>' +
              '</div>' +
            '</div>';
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

    function openPostModal() {
        var m = postModalEl();
        if (!m) return;
        resetPostModal();
        m.showModal();
        var cap = captionEl();
        if (cap) cap.focus();
    }

    function closePostModal() {
        var m = postModalEl();
        if (m && m.open) m.close();
    }

    function publishPost() {
        var cap = captionEl();
        var text = cap ? (cap.value || '') : '';
        if (!postFiles.length && !text.trim()) {
            setPostError('Добавьте текст или выберите фото');
            return;
        }
        var submit = postSubmitEl();
        if (submit) submit.disabled = true;
        var fd = new FormData();
        fd.append('content', text);
        fd.append('layout', postLayout);
        postFiles.forEach(function (f) { fd.append('images', f); });
        postForm(CFG.urls.feed, fd)
            .then(function (res) {
                if (!res.ok) {
                    setPostError('Не удалось опубликовать');
                    if (submit) submit.disabled = false;
                    return;
                }
                var html = buildPostCard(res.data);
                var feedPostsEl = document.getElementById('feedPosts');
                var feedMainEl = document.querySelector('.feed-main');
                if (feedPostsEl) feedPostsEl.insertAdjacentHTML('afterbegin', html);
                else if (feedMainEl) feedMainEl.insertAdjacentHTML('afterbegin', html);
                closePostModal();
                toast('Публикация опубликована');
                resetPostModal();
                bindAll(document);
                var empty = document.querySelector('.feed-empty');
                if (empty) empty.remove();
            })
            .catch(function () {
                setPostError('Ошибка сети');
                if (submit) submit.disabled = false;
            });
    }

    /* ====================== Новая карточка поста ====================== */
    function avatarHtml(username, avatarUrl) {
        if (avatarUrl) {
            return '<img src="' + esc(avatarUrl) + '" alt="' + esc(username) + '" loading="lazy" decoding="async">';
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
                    : '<img src="' + esc(items[i].url) + '" class="grid-media" loading="lazy" decoding="async">';
            }
            out += '</div>';
            return out;
        }
        out += '<div class="post-carousel"><div class="carousel-track">';
        for (i = 0; i < items.length; i++) {
            out += items[i].type === 'video'
                ? '<video src="' + esc(items[i].url) + '" class="carousel-img" controls playsinline></video>'
                : '<img src="' + esc(items[i].url) + '" class="carousel-img" loading="lazy" decoding="async">';
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

    function postMenuHtml(id, canEdit, canDelete) {
        var html = '' +
            '<div class="post-more-wrap">' +
            '  <button type="button" class="post-more-btn" aria-label="Ещё" aria-haspopup="menu" aria-expanded="false">' +
                 MORE_SVG + '</button>' +
            '  <div class="post-more-menu" role="menu">' +
            '    <button type="button" class="post-menu-item share-post-btn" data-post-id="' + id + '" role="menuitem">' +
                   PLANE_SVG + '<span>Поделиться</span></button>' +
            '    <button type="button" class="post-menu-item copy-post-link" data-post-id="' + id + '" role="menuitem">' +
                   LINK_SVG + '<span>Скопировать ссылку</span></button>';
        if (canEdit || canDelete) {
            html += '<div class="post-menu-sep"></div>';
        }
        if (canEdit) {
            html += '<button type="button" class="post-menu-item edit-post-btn" data-post-id="' + id + '" role="menuitem">' +
                PENCIL_SVG + '<span>Редактировать</span></button>';
        }
        if (canDelete) {
            html += '<button type="button" class="post-menu-item danger delete-post-btn" data-post-id="' + id + '" role="menuitem">' +
                '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/></svg>' +
                '<span>Удалить</span></button>';
        }
        html += '  </div></div>';
        return html;
    }

    function buildPostCard(d) {
        var profileUrl = CFG.profileBase + encodeURIComponent(d.author) + '/';
        var caption = d.content
            ? '<div class="post-content">' + esc(d.content) + '</div>'
            : '';
        var media = d.media_items && d.media_items.length
            ? '<div class="post-media">' + mediaHtml(d.media_items, d.layout) + '</div>'
            : '';
        return '' +
            '<div class="card post-card" id="post-' + d.id + '" data-post-id="' + d.id + '">' +
            '  <div class="post-avatar-col">' +
            '    <a class="post-avatar-link" href="' + profileUrl + '" aria-label="' + esc(d.author) + '">' +
            '      <span class="post-avatar">' + avatarHtml(d.author, d.author_avatar) + '</span>' +
            '    </a>' +
            '  </div>' +
            '  <div class="post-main">' +
            '    <div class="post-head-row">' +
            '      <div class="post-head-left">' +
            '        <a class="post-author-link" href="' + profileUrl + '">' +
            '          <span class="post-author">' + esc(d.author) + '</span></a>' +
            '        <span class="post-time" title="' + esc(fullDate(d.created_at)) + '">' +
                       esc(timeAgo(d.created_at)) + '<span class="post-edited" style="display:none;"> · изменено</span></span>' +
            '      </div>' +
                   postMenuHtml(d.id, true, true) +
            '    </div>' +
                   caption +
                   media +
            '    <div class="post-actions">' +
            '      <button type="button" class="like-btn" data-post-id="' + d.id + '" data-liked="false" aria-label="Нравится">' +
            '        <span class="like-icon">' + LIKE_OUTLINE + '</span></button>' +
            '      <button type="button" class="toggle-comments-btn" data-post-id="' + d.id + '" aria-label="Комментарии">' + BUBBLE_SVG + '</button>' +
            '      <button type="button" class="share-post-btn" data-post-id="' + d.id + '" aria-label="Поделиться">' + PLANE_SVG + '</button>' +
            '    </div>' +
            '    <div class="post-meta-line">' +
            '      <span class="likes-count likes-open" data-post-id="' + d.id + '" role="button" tabindex="0" title="Кто лайкнул">' + likesText(0) + '</span>' +
            '      <span class="meta-sep">·</span>' +
            '      <span class="comments-count toggle-comments-btn" data-post-id="' + d.id + '">' + commentsText(0) + '</span>' +
            '      <span class="meta-sep">·</span>' +
            '      <span class="views-count">' + viewsText(0) + '</span>' +
            '    </div>' +
            '    <div class="comments-block" id="comments-' + d.id + '" style="display:none;">' +
            '      <div class="comments-list"><div class="comments-empty">Пока нет комментариев — напишите первый.</div></div>' +
            '      <form class="add-comment-form" data-post-id="' + d.id + '">' +
            '        <span class="comment-me">' +
                          (CFG.meAvatar
                              ? '<img src="' + esc(CFG.meAvatar) + '" alt="" loading="lazy" decoding="async">'
                              : '<span class="comment-avatar-ph">' + esc(((CFG.meName || '?').charAt(0) || '?').toUpperCase()) + '</span>') +
            '        </span>' +
            '        <div class="comment-input-wrap">' +
            '          <input type="text" name="text" placeholder="Добавьте комментарий…" maxlength="500" autocomplete="off">' +
            '          <button type="submit" class="comment-send-btn" title="Отправить" disabled>' + PLANE_SVG_SM + '</button>' +
            '        </div>' +
            '      </form>' +
            '    </div>' +
            '  </div>' +
            '</div>';
    }

    /* ====================== Инициализация ====================== */
    function bindAll(root) {
        bindLikes(root);
        bindComments(root);
        bindCarouselDots(root);
        bindStoryBubbles(root);
        if (window.observePostViews) window.observePostViews(root);
        if (window.__drainPostViews) window.__drainPostViews();
    }

    /* Перепривязка после SPA-навигации: перечитывает DOM и навешивает слушатели */
    function bindPage() {
        bindAll(document);
        bindStoryComposer();
        refreshStoriesBar();
        document.querySelectorAll('.comments-block').forEach(function (b) { b.style.display = 'none'; });
        initInfiniteScroll();
    }

    /* Единый делегированный обработчик кликов: выживает при SPA-навигации */
    document.addEventListener('click', function (e) {
        var t = e.target;
        if (!t || !t.closest) return;
        var el;

        if (t.closest('#openPostModal') || t.closest('.feed-empty-btn')) {
            openPostModal();
            return;
        }
        if (t.closest('[data-close-post]')) { closePostModal(); return; }
        if (t.closest('#postBackBtn')) { showPostStep('edit'); return; }
        if (t.closest('#postPickerArea') || t.closest('#addMoreMediaBtn')) {
            var pi = postInputEl();
            if (pi) pi.click();
            return;
        }
        if ((el = t.closest('.preview-remove-btn')) && el.closest('#postPreview')) {
            var idx = parseInt(el.getAttribute('data-index'), 10);
            if (!isNaN(idx)) { postFiles.splice(idx, 1); renderPostModal(); }
            return;
        }
        if ((el = t.closest('#postViewMode button'))) {
            postLayout = el.getAttribute('data-mode');
            renderPostModal();
            return;
        }
        if (t.closest('#postPreviewBtn')) { showPostStep('preview'); return; }
        if (t.closest('#postSubmitBtn')) { publishPost(); return; }

        if (t.closest('#addStoryBtn')) { openStoryModal(); return; }
        if (t.closest('[data-close-story]')) { closeStoryModal(); return; }
        if (t.closest('#storyPickerArea')) {
            var si = storyInputEl();
            if (si) si.click();
            return;
        }
        if (t.closest('#storyPreviewRemove')) {
            storyFile = null;
            var sinp = storyInputEl();
            if (sinp) sinp.value = '';
            renderStoryPreview();
            return;
        }
        if (t.closest('#storyResetFrame')) {
            storyFocusX = 50;
            storyFocusY = 50;
            storyZoom = 100;
            applyStoryLayout();
            return;
        }
        if ((el = t.closest('#storyFitModes button'))) {
            storyFit = el.getAttribute('data-fit') || 'contain';
            applyStoryLayout();
            return;
        }
        if ((el = t.closest('#storyBackgroundModes button'))) {
            storyBackground = el.getAttribute('data-background') || 'blur';
            applyStoryLayout();
            return;
        }
        if (t.closest('#storySubmitBtn')) { submitStory(); return; }

        if (t.closest('#storyViewerClose')) { storyViewer.close(); return; }
        if (t.closest('#storyNextZone')) {
            if (storyViewer._ignoreTap) { storyViewer._ignoreTap = false; return; }
            storyViewer.next();
            return;
        }
        if (t.closest('#storyPrevZone')) {
            if (storyViewer._ignoreTap) { storyViewer._ignoreTap = false; return; }
            storyViewer.prev();
            return;
        }
        if (t.closest('#storyDeleteBtn')) { storyViewer.deleteCurrent(); return; }
        if (t.closest('#storySoundBtn')) { storyViewer.toggleSound(); return; }
        if (t.closest('#storyLikeBtn')) { storyViewer.toggleLike(); return; }
        if (t.closest('#storyStatsBtn')) { storyViewer.openStats(); return; }
        if (t.closest('#storyStatsClose') || t.id === 'storyStatsModal') {
            closeStoryStatsModal();
            return;
        }
        if (t.closest('.likes-open')) {
            openPostLikes(t.closest('.likes-open').getAttribute('data-post-id'));
            return;
        }
        if (t.closest('#postLikesClose') || t.id === 'postLikesModal') {
            closePostLikesModal();
            return;
        }

        if (t.closest('#lightboxClose')) { closeLightbox(); return; }
        if (t.closest('#lightboxPrev')) { lightboxStep(-1); return; }
        if (t.closest('#lightboxNext')) { lightboxStep(1); return; }
        if (t.id === 'lightboxOverlay') { closeLightbox(); return; }

        if (t.closest('#confirmCancel')) { closeConfirm(true); return; }
        if (t.closest('#confirmDelete')) {
            var act = confirmAction;
            closeConfirm(false);
            if (act) act();
            return;
        }
        if (t.id === 'confirmOverlay') { closeConfirm(true); return; }
    });

    document.addEventListener('change', function (e) {
        var t = e.target;
        if (!t) return;
        if (t.id === 'postFileInput') { addPostFiles(t.files); t.value = ''; }
        if (t.id === 'storyFileInput') { storyFileChange(t); }
    });

    document.addEventListener('input', function (e) {
        var t = e.target;
        if (t && t.id === 'postCaption') {
            syncPostSubmit();
        }
        if (t && t.id === 'storyZoomRange') {
            storyZoom = storyNumber(t.value, 100, 100, 250);
            applyStoryLayout();
        }
        if (t && t.id === 'storyCaption') {
            var previewCaption = storyPreviewCaptionEl();
            if (previewCaption) {
                var text = t.value.trim();
                previewCaption.textContent = text;
                previewCaption.style.display = text ? 'block' : 'none';
            }
        }
    });

    document.addEventListener('drop', function (e) {
        var t = e.target;
        if (t && t.closest && t.closest('#postPickerArea') && e.dataTransfer) {
            e.preventDefault();
            addPostFiles(e.dataTransfer.files);
        }
    });
    document.addEventListener('dragover', function (e) {
        var t = e.target;
        if (t && t.closest && t.closest('#postPickerArea')) e.preventDefault();
    });

    document.addEventListener('keydown', function (e) {
        if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.matches && e.target.matches('.likes-open')) {
            e.preventDefault();
            openPostLikes(e.target.getAttribute('data-post-id'));
            return;
        }
        var lb = lightboxEl();
        if (lb && lb.style.display === 'flex') {
            if (e.key === 'Escape') { closeLightbox(); return; }
            if (e.key === 'ArrowRight') { lightboxStep(1); return; }
            if (e.key === 'ArrowLeft') { lightboxStep(-1); return; }
        }
        if (storyViewer && storyViewer.root && storyViewer.root.classList.contains('open')) {
            if (e.key === 'ArrowRight') { e.preventDefault(); storyViewer.next(); return; }
            if (e.key === 'ArrowLeft') { e.preventDefault(); storyViewer.prev(); return; }
        }
        if (e.key !== 'Escape') return;
        if (storyViewer && storyViewer.root && storyViewer.root.classList.contains('open')) storyViewer.close();
        closePostLikesModal();
    });

    bindPage();
    window.__pageInits = window.__pageInits || [];
    window.__pageInits.push(bindPage);

    /* Мобильная клавиатура: подскроллить поле комментария в видимую область */
    document.addEventListener('focusin', function (e) {
        var t = e.target;
        if (!t || !t.matches || !t.matches('.add-comment-form input[name="text"]')) return;
        setTimeout(function () {
            try { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
            catch (err) { t.scrollIntoView(); }
        }, 300);
    });
})();
