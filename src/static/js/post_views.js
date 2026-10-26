(function () {
    'use strict';

    var DWELL_MS = 1000;
    var MAX_BATCH = 50;

    var pending = new Set();
    var marked = new Set();
    var visible = new Set();
    var dwellTimers = new WeakMap();
    var flushTimer = null;
    var queuedRoots = [];

    function csrfToken() {
        var match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
        if (match) return decodeURIComponent(match[1]);
        var input = document.querySelector('[name=csrfmiddlewaretoken]');
        return input ? input.value : '';
    }

    function viewsLabel(n, el) {
        return String(n);
    }

    function updateViewsCount(postId) {
        var card = document.querySelector('.post-card[data-post-id="' + postId + '"]');
        if (!card) return;
        var el = card.querySelector('.views-count');
        if (!el) return;
        var current = parseInt(el.getAttribute('data-views-count'), 10);
        if (isNaN(current)) current = parseInt((el.textContent || '').trim(), 10);
        if (isNaN(current)) return;
        var next = current + 1;
        el.setAttribute('data-views-count', String(next));
        el.textContent = viewsLabel(next, el);
    }

    function flush(keepalive) {
        if (flushTimer) {
            clearTimeout(flushTimer);
            flushTimer = null;
        }
        if (!pending.size) return;
        var ids = Array.from(pending).slice(0, MAX_BATCH);
        ids.forEach(function (id) { pending.delete(id); });
        var url = window.POST_VIEWS_URL;
        if (!url) {
            ids.forEach(function (id) { pending.add(id); });
            return;
        }
        var headers = {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        };
        var token = csrfToken();
        if (token) headers['X-CSRFToken'] = token;
        try {
            fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ post_ids: ids }),
                credentials: 'same-origin',
                keepalive: !!keepalive
            }).then(function (res) {
                if (!res.ok) return null;
                return res.json();
            }).then(function (data) {
                if (data && data.created_ids) {
                    data.created_ids.forEach(updateViewsCount);
                }
            }).catch(function () {});
        } catch (err) { /* ignore */ }
        if (pending.size) scheduleFlush();
    }

    function scheduleFlush() {
        if (flushTimer) clearTimeout(flushTimer);
        flushTimer = setTimeout(function () { flush(false); }, 600);
    }

    function stopDwell(el) {
        var timer = dwellTimers.get(el);
        if (timer) {
            clearTimeout(timer);
            dwellTimers.delete(el);
        }
    }

    function startDwell(el) {
        if (document.visibilityState === 'hidden') return;
        var id = el.getAttribute('data-post-id');
        if (!id || marked.has(id) || dwellTimers.has(el)) return;
        var timer = setTimeout(function () {
            dwellTimers.delete(el);
            if (document.visibilityState === 'hidden' || !visible.has(el)) return;
            marked.add(id);
            pending.add(id);
            scheduleFlush();
        }, DWELL_MS);
        dwellTimers.set(el, timer);
    }

    function onIntersect(entries) {
        entries.forEach(function (en) {
            var el = en.target;
            if (en.isIntersecting) {
                visible.add(el);
                startDwell(el);
            } else {
                visible.delete(el);
                stopDwell(el);
            }
        });
    }

    function ensureObserver() {
        if (!('IntersectionObserver' in window)) return null;
        if (!window.__postViewsObserver) {
            window.__postViewsObserver = new IntersectionObserver(onIntersect, {
                threshold: 0.35
            });
        }
        return window.__postViewsObserver;
    }

    function observePostViews(root) {
        var observer = ensureObserver();
        if (!observer) return;
        var scope = root || document;
        var cards;
        if (typeof scope.querySelectorAll === 'function') {
            cards = scope.querySelectorAll('.post-card, .post[data-post-id]');
        } else {
            cards = document.querySelectorAll('.post-card, .post[data-post-id]');
        }
        Array.prototype.forEach.call(cards, function (el) {
            if (el.__postViewObserved) return;
            if (!el.getAttribute('data-post-id')) return;
            el.__postViewObserved = true;
            observer.observe(el);
        });
    }

    function safeObserve(root) {
        if (window.__postViewsReady) {
            observePostViews(root);
        } else {
            queuedRoots.push(root || document);
        }
    }

    function drainQueue() {
        if (window.__postViewsReady) return;
        window.__postViewsReady = true;
        var roots = queuedRoots;
        queuedRoots = [];
        roots.forEach(function (r) { observePostViews(r); });
    }

    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') {
            visible.forEach(stopDwell);
        } else {
            visible.forEach(startDwell);
        }
    });

    window.addEventListener('pagehide', function () {
        stopDwellAll();
        flush(true);
    });

    function stopDwellAll() {
        visible.forEach(stopDwell);
    }

    window.observePostViews = safeObserve;
    window.__drainPostViews = drainQueue;

    if (document.readyState !== 'loading') {
        drainQueue();
    } else {
        document.addEventListener('DOMContentLoaded', function () {
            drainQueue();
        });
    }
})();
